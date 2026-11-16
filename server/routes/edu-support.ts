import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import {
  ApiError,
  executeIdempotentMutation,
} from '@nocobase/app-server/router';
import type {
  DatabaseConnection,
  DatabaseManager,
  RepositoryPolicy,
} from '@nocobase/db';
import type { Context, MiddlewareHandler } from 'hono';

import { DOMAIN, eduError } from '../edu/errors.js';

export { DOMAIN, eduError };

export type EduEnv = {
  Variables: AuthorizationEnv['Variables'] & {
    auth: { user: { id: string } } | null;
    eduPolicies: Readonly<Record<string, RepositoryPolicy>>;
  };
};

/**
 * Authorizes one composite action before anything else runs (before input validation, so a caller without the
 * permission learns nothing about the input) and keeps the per-collection policies for the handler.
 */
export function needs(
  resource: string,
  action: string,
): MiddlewareHandler<EduEnv> {
  return async (c, next) => {
    c.set('eduPolicies', await policiesOf(c, resource, action));
    await next();
  };
}

export async function policiesOf(
  c: Context<EduEnv>,
  resource: string,
  action: string,
): Promise<Readonly<Record<string, RepositoryPolicy>>> {
  const decision = await c.get('authz').authorize({
    resource: { type: 'composite', id: resource },
    action,
  });
  const policies = decision.conditions?.database;
  if (decision.effect === 'deny' || !policies) {
    throw new AuthorizationDeniedError(decision);
  }
  return policies;
}

/**
 * The policies of an action the caller may or may not hold: `null` instead of a refusal. For a page that shows more
 * to a person with more permissions (tuition next to attendance); the part that was refused is simply left out.
 */
export async function optionalPoliciesOf(
  c: Context<EduEnv>,
  resource: string,
  action: string,
): Promise<Readonly<Record<string, RepositoryPolicy>> | null> {
  try {
    return await policiesOf(c, resource, action);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return null;
    throw error;
  }
}

export function policyOf(
  c: Context<EduEnv>,
  collection: string,
): RepositoryPolicy {
  const policy = c.get('eduPolicies')[collection];
  if (!policy) {
    throw new ApiError({
      status: 'PERMISSION_DENIED',
      reason: 'EDU_PERMISSION_DENIED',
      domain: DOMAIN,
      message: 'This action is not allowed.',
    });
  }
  return policy;
}

/**
 * Runs a write that moves money or a balance once per operation key.
 *
 * The request must carry `Idempotency-Key`, as a standard write does (the forms send one through `useSubmission`). It
 * joins the receipt contract: a second request with the same key — a double click, Enter and the button together, a
 * retry after a lost answer — is answered with the first result and writes nothing again. The route's middleware has
 * authorized the action for this very request, replays included, before this runs; `stillVisible` then checks that
 * the caller still sees what the first attempt produced.
 */
export async function writeOnce<T>(
  c: Context<EduEnv>,
  options: {
    readonly database: DatabaseManager;
    readonly appName: string;
    /** The action and its target, the same for every attempt of one operation. */
    readonly operation: string;
    readonly input: unknown;
    readonly execute: (transaction: DatabaseConnection) => Promise<T>;
    readonly stillVisible: (result: T) => Promise<boolean>;
  },
): Promise<T> {
  const key = c.req.header('idempotency-key');
  if (!key) {
    throw eduError(
      'INVALID_ARGUMENT',
      'OPERATION_KEY_REQUIRED',
      'This write requires an Idempotency-Key header.',
    );
  }
  const userId = currentUserId(c);
  const result = await executeIdempotentMutation<T>({
    connection: options.database.connection(),
    key,
    principal: `${options.appName}:${userId}`,
    operation: options.operation,
    input: options.input,
    authorize: () => undefined,
    authorizeReplay: async (data) => {
      if (!(await options.stillVisible(data))) {
        throw eduError(
          'PERMISSION_DENIED',
          'EDU_PERMISSION_DENIED',
          'This action is not allowed.',
        );
      }
    },
    execute: options.execute,
  });
  c.header('Idempotency-Replayed', String(result.replayed));
  return result.data;
}

export function currentUserId(c: Context<EduEnv>): string {
  const id = c.get('auth')?.user.id;
  if (typeof id !== 'string') {
    throw eduError(
      'PERMISSION_DENIED',
      'EDU_NO_USER',
      'A signed-in user is required.',
    );
  }
  return id;
}
