import { base64UrlToBytes, base64UrlToUtf8, tryDecodeBase64Url } from './b64url';
import { assertRecipientPrivateJwk, computeJwkThumbprint, type EcPrivateJwk, openFromEnvelope } from './hpke';
import type { Jwks, JwksResolver } from './jwks';
import {
  HPKE_SUITE_ID,
  RECEIPT_ENVELOPE_INFO,
  RECEIPT_ENVELOPE_VERSION,
  type ReceiptCallbackV2,
  type ReceiptHeader,
  type ReceiptPayload,
  type ReceiptPayloadV2,
  receiptEnvelopeAad,
} from './receipt-types';

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
  'malformed_envelope',
  'open_failed',
  'thumbprint_mismatch',
  'plaintext_not_accepted',
] as const;

export type VerifyReason = (typeof VERIFY_REASONS)[number];

export const RECEIPT_VERSIONS = [1, 2] as const;

export type ReceiptVersion = (typeof RECEIPT_VERSIONS)[number];

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
  /** The RP's P-256 private JWK; required to open a v2 sealed envelope. */
  recipientKey?: EcPrivateJwk;
  /** Receipt versions this RP accepts. Defaults to all of them (the rollout widen state). */
  acceptedVersions?: readonly ReceiptVersion[];
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
 * A compact JWS string is a v1 plaintext receipt; a v2 callback body carries
 * the sealed envelope plus the outer routing ids that bind as HPKE `aad`. The
 * v2 path opens the envelope with `options.recipientKey`, then runs the same
 * checks as v1 on the recovered JWS — compact-JWS shape, `alg=ES256` + `kid`
 * present, key lookup (JWKS or resolver), key `status=active`, ES256
 * signature (WebCrypto), then `aud`, `exp`, `session_id` (when expected),
 * `nonce`, and `predicate_result === true` — followed by the outer/inner id
 * match and the `rp_key_thumbprint` check against the opening key. One clock
 * snapshot is taken at entry and threaded through open and verify.
 *
 * Never throws on attacker-controlled input (every failure is a reason code);
 * throws `TypeError` only for caller misconfiguration (a missing or malformed
 * `recipientKey` when a v2 envelope must be opened).
 */
export async function verify(receipt: string | ReceiptCallbackV2, options: VerifyOptions): Promise<VerifyResult> {
  const nowSeconds =
    options.now === undefined
      ? Date.now() / 1000
      : options.now instanceof Date
        ? options.now.getTime() / 1000
        : options.now;
  const accepted: readonly ReceiptVersion[] = options.acceptedVersions ?? RECEIPT_VERSIONS;

  if (typeof receipt === 'string') {
    if (!accepted.includes(1)) {
      return fail('plaintext_not_accepted');
    }
    return verifyCompactJws(receipt, options, nowSeconds);
  }
  if (!accepted.includes(2)) {
    // A v1-only verifier answers exactly as the pre-v2 verifier would have:
    // an envelope object is simply not a receipt it can parse.
    return fail('malformed_receipt');
  }
  return verifySealedCallback(receipt, options, nowSeconds);
}

async function verifySealedCallback(
  callback: ReceiptCallbackV2,
  options: VerifyOptions,
  nowSeconds: number,
): Promise<VerifyResult> {
  if (!isSealedCallbackShape(callback)) {
    return fail('malformed_envelope');
  }
  const recipientKey = options.recipientKey;
  if (!recipientKey) {
    throw new TypeError('@meum/verify: options.recipientKey is required to open a v2 sealed receipt');
  }
  assertRecipientPrivateJwk(recipientKey);

  let innerJws: string;
  try {
    innerJws = await openFromEnvelope(
      recipientKey,
      callback.receipt,
      RECEIPT_ENVELOPE_INFO,
      receiptEnvelopeAad(callback.session_id, callback.nonce),
    );
  } catch {
    return fail('open_failed');
  }

  const result = await verifyCompactJws(innerJws, options, nowSeconds);
  if (!result.valid || !result.payload) {
    return result;
  }
  const payload = result.payload;
  // The opened inner JWS must re-assert the outer routing ids, even
  // when the caller did not pass expectedSessionId.
  if (payload.session_id !== callback.session_id) {
    return fail('wrong_session', payload);
  }
  if (payload.nonce !== callback.nonce) {
    return fail('wrong_nonce', payload);
  }
  const thumbprint = (payload as Partial<ReceiptPayloadV2>).rp_key_thumbprint;
  if (typeof thumbprint !== 'string') {
    return fail('malformed_receipt', payload);
  }
  if (thumbprint !== (await computeJwkThumbprint(recipientKey))) {
    return fail('thumbprint_mismatch', payload);
  }
  return result;
}

// AES-256-GCM appends a 16-byte tag, so no well-formed ct can be shorter.
const GCM_TAG_BYTES = 16;
// X9.63 uncompressed P-256 point: 0x04 tag byte plus two 32-byte coordinates.
const ENC_POINT_BYTES = 65;
const ENC_POINT_TAG = 0x04;

function isSealedCallbackShape(callback: unknown): callback is ReceiptCallbackV2 {
  if (typeof callback !== 'object' || callback === null) {
    return false;
  }
  const body = callback as Record<string, unknown>;
  if (typeof body.session_id !== 'string' || body.session_id.length === 0) {
    return false;
  }
  if (typeof body.nonce !== 'string' || body.nonce.length === 0) {
    return false;
  }
  if (typeof body.receipt !== 'object' || body.receipt === null) {
    return false;
  }
  const envelope = body.receipt as Record<string, unknown>;
  if (envelope.v !== RECEIPT_ENVELOPE_VERSION || envelope.suite !== HPKE_SUITE_ID) {
    return false;
  }
  if (typeof envelope.kid !== 'string' || envelope.kid.length === 0) {
    return false;
  }
  if (typeof envelope.enc !== 'string' || typeof envelope.ct !== 'string') {
    return false;
  }
  const enc = tryDecodeBase64Url(envelope.enc);
  if (!enc || enc.length !== ENC_POINT_BYTES || enc[0] !== ENC_POINT_TAG) {
    return false;
  }
  const ct = tryDecodeBase64Url(envelope.ct);
  return ct !== null && ct.length >= GCM_TAG_BYTES;
}

async function verifyCompactJws(receipt: string, options: VerifyOptions, nowSeconds: number): Promise<VerifyResult> {
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
