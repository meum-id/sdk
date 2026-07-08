/**
 * Frozen numeric error codes and categories, dependency-free so runtime
 * consumers can import them without pulling Zod.
 */
export const ERROR_CODES = {
  AUTH_INVALID_API_KEY: 1001,
  AUTH_EXPIRED_API_KEY: 1002,
  SESSION_NOT_FOUND: 2001,
  SESSION_EXPIRED: 2002,
  KEY_INVALID: 3001,
  KEY_DUPLICATE: 3002,
  KEY_NOT_FOUND: 3003,
  KEY_ALREADY_REVOKED: 3004,
  RATE_LIMITED: 5001,
  VALIDATION_MISSING_FIELD: 7002,
  VALIDATION_INVALID_FORMAT: 7003,
  INTERNAL_DATABASE: 8002,
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ERROR_CATEGORIES = ['auth', 'session', 'key', 'rate_limit', 'validation', 'internal'] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

const CATEGORY_BY_THOUSANDS: Record<number, ErrorCategory> = {
  1: 'auth',
  2: 'session',
  3: 'key',
  5: 'rate_limit',
  7: 'validation',
  8: 'internal',
};

export function errorCategoryForCode(code: ErrorCode): ErrorCategory {
  const category = CATEGORY_BY_THOUSANDS[Math.floor(code / 1000)];
  if (!category) {
    throw new Error(`no category for error code ${code}`);
  }
  return category;
}
