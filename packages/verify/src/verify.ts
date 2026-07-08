import { base64UrlToBytes, base64UrlToUtf8 } from './b64url';
import type { Jwks, JwksResolver } from './jwks';
import type { ReceiptHeader, ReceiptPayload } from './receipt-types';

export const VERIFY_REASONS = [
  'malformed_receipt',
  'unsupported_algorithm',
  'unknown_kid',
  'key_not_active',
  'bad_signature',
  'wrong_audience',
  'expired',
  'wrong_session',
  'wrong_nonce',
  'predicate_false',
] as const;

export type VerifyReason = (typeof VERIFY_REASONS)[number];

export interface VerifyOptions {
  /** Static JWKS document (e.g. a captured `jwks.json?kid=…` response). */
  jwks?: Jwks;
  /** Dynamic per-kid JWKS lookup; used when `jwks` is absent. */
  jwksResolver?: JwksResolver;
  /** The verifying RP's `rp_id`; must equal the receipt `aud`. */
  expectedAudience: string;
  /** The session nonce the RP was issued; must equal the receipt `nonce`. */
  expectedNonce: string;
  /** The session the receipt must belong to; checked when provided. */
  expectedSessionId?: string;
  /** Verification time: Unix seconds or a Date. Defaults to the current time. */
  now?: number | Date;
}

export interface VerifyResult {
  valid: boolean;
  predicate_result: boolean | null;
  reason: VerifyReason | null;
  /** The decoded payload, when the receipt was parseable. */
  payload?: ReceiptPayload;
}

function fail(reason: VerifyReason, payload?: ReceiptPayload): VerifyResult {
  return {
    valid: false,
    predicate_result: payload ? payload.predicate_result : null,
    reason,
    ...(payload ? { payload } : {}),
  };
}

function decodeJson<T>(segment: string): T | null {
  try {
    return JSON.parse(base64UrlToUtf8(segment)) as T;
  } catch {
    return null;
  }
}

function isReceiptPayload(value: unknown): value is ReceiptPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.iss === 'string' &&
    typeof payload.aud === 'string' &&
    typeof payload.session_id === 'string' &&
    typeof payload.nonce === 'string' &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number' &&
    typeof payload.predicate_result === 'boolean' &&
    typeof payload.analytics_allowed === 'boolean'
  );
}

/**
 * Offline receipt verification. No network access beyond the caller-supplied
 * JWKS resolver; no Meum backend call in this path.
 *
 * Checks, in order: compact-JWS shape, `alg=ES256` + `kid` present, key lookup
 * (JWKS or resolver), key `status=active`, ES256 signature (WebCrypto), then
 * `aud`, `exp`, `session_id` (when expected), `nonce`, and
 * `predicate_result === true`.
 */
export async function verify(receipt: string, options: VerifyOptions): Promise<VerifyResult> {
  const segments = receipt.split('.');
  if (segments.length !== 3) {
    return fail('malformed_receipt');
  }
  const [headerSegment, payloadSegment, signatureSegment] = segments as [string, string, string];

  const header = decodeJson<ReceiptHeader>(headerSegment);
  if (!header || typeof header.kid !== 'string' || header.kid.length === 0) {
    return fail('malformed_receipt');
  }
  if (header.alg !== 'ES256') {
    return fail('unsupported_algorithm');
  }

  const rawPayload = decodeJson<unknown>(payloadSegment);
  if (!isReceiptPayload(rawPayload)) {
    return fail('malformed_receipt');
  }
  const payload = rawPayload;

  let jwks: Jwks | null = options.jwks ?? null;
  if (!jwks && options.jwksResolver) {
    jwks = await options.jwksResolver(header.kid);
  }
  const key = jwks?.keys.find((candidate) => candidate.kid === header.kid);
  if (!key) {
    return fail('unknown_kid', payload);
  }
  if (key.status !== undefined && key.status !== 'active') {
    return fail('key_not_active', payload);
  }

  let signatureValid = false;
  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      { kty: key.kty, crv: key.crv, x: key.x, y: key.y },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const signature = base64UrlToBytes(signatureSegment);
    const signedBytes = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);
    signatureValid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, signature, signedBytes);
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    return fail('bad_signature', payload);
  }

  if (payload.aud !== options.expectedAudience) {
    return fail('wrong_audience', payload);
  }

  const nowSeconds =
    options.now === undefined
      ? Date.now() / 1000
      : options.now instanceof Date
        ? options.now.getTime() / 1000
        : options.now;
  if (nowSeconds >= payload.exp) {
    return fail('expired', payload);
  }

  if (options.expectedSessionId !== undefined && payload.session_id !== options.expectedSessionId) {
    return fail('wrong_session', payload);
  }

  if (payload.nonce !== options.expectedNonce) {
    return fail('wrong_nonce', payload);
  }

  if (payload.predicate_result !== true) {
    return fail('predicate_false', payload);
  }

  return { valid: true, predicate_result: true, reason: null, payload };
}
