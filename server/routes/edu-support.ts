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
