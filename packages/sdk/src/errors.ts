import { ERROR_CODES } from '@meum/contracts/codes';

/** Parsed wire error-envelope body; fields beyond `code`/`message` are best-effort. */
export interface ApiErrorBody {
  code: number;
  message: string;
  category?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

export class MeumError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Client-side rejection before any network call (bad predicate, non-HTTPS URL). */
export class MeumValidationError extends MeumError {}

/** A non-2xx API response carrying the Meum error envelope. */
export class MeumApiError extends MeumError {
  readonly status: number;
  readonly code: number;
  readonly category: string | undefined;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.category = body.category;
    this.retryable = body.retryable ?? false;
    this.details = body.details;
  }
}

/** The session (or receipt window) is past expiration. */
export class MeumExpiredError extends MeumApiError {}

/** The transport failed before a well-formed API response arrived. */
export class MeumNetworkError extends MeumError {}

/** The holder cancelled the verification flow (usage result `user_cancelled`). */
export class MeumUserCancelledError extends MeumError {
  constructor(message = 'The user cancelled the verification flow') {
    super(message);
  }
}

export function apiErrorFrom(status: number, body: ApiErrorBody): MeumApiError {
  if (status === 410 || body.code === ERROR_CODES.SESSION_EXPIRED) {
    return new MeumExpiredError(status, body);
  }
  return new MeumApiError(status, body);
}

/** Best-effort structural parse of the wire error envelope. */
export function parseErrorBody(value: unknown): ApiErrorBody | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const error = (value as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const body = error as Record<string, unknown>;
  if (typeof body.code !== 'number' || typeof body.message !== 'string') {
    return null;
  }
  return {
    code: body.code,
    message: body.message,
    ...(typeof body.category === 'string' ? { category: body.category } : {}),
    ...(typeof body.retryable === 'boolean' ? { retryable: body.retryable } : {}),
    ...(typeof body.details === 'object' && body.details !== null
      ? { details: body.details as Record<string, unknown> }
      : {}),
  };
}
