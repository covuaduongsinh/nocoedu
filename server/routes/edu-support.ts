import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { ApiError } from '@nocobase/app-server/router';
import type { RepositoryPolicy } from '@nocobase/db';
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
