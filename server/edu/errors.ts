import { ApiError } from '@nocobase/app-server/router';

export const DOMAIN = 'edu';

/** The error every NocoEdu route and write helper answers with; never hand-write an error body. */
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
