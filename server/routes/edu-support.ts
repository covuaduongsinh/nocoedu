import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { ApiError } from '@nocobase/app-server/router';
import type { RepositoryPolicy } from '@nocobase/db';
import type { Context, MiddlewareHandler } from 'hono';

export const DOMAIN = 'edu';

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
 * A policy the handler cannot work without: refused (403) when the caller does not hold the composite action or the
 * action has no policy for that collection.
 */
export async function requiredPolicy(
  c: Context<EduEnv>,
  resource: string,
  action: string,
  collection: string,
): Promise<RepositoryPolicy> {
  const policy = (await policiesOf(c, resource, action))[collection];
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
 * The policy of a composite action the caller may or may not hold: `undefined` when it is not granted, so a page that
 * only adds names (a class, a branch) or a section of a file (tuition) leaves that part out instead of failing.
 */
export async function optionalPolicy(
  c: Context<EduEnv>,
  resource: string,
  action: string,
  collection: string,
): Promise<RepositoryPolicy | undefined> {
  try {
    return (await policiesOf(c, resource, action))[collection];
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return undefined;
    throw error;
  }
}

export function eduError(
  status:
    | 'NOT_FOUND'
    | 'INVALID_ARGUMENT'
    | 'FAILED_PRECONDITION'
    | 'ALREADY_EXISTS'
    | 'PERMISSION_DENIED',
  reason: string,
  message: string,
  field?: string,
): ApiError {
  return new ApiError({
    status,
    reason,
    domain: DOMAIN,
    message,
    ...(field ? { fieldViolations: [{ field, description: message }] } : {}),
  });
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
