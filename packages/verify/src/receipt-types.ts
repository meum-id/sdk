/**
 * Wire-shape types and frozen HPKE envelope constants for the device-minted
 * receipt. Hand-mirrored from `@meum/contracts` so this package carries zero
 * runtime dependencies.
 */

/** Version discriminant carried as `v` on the sealed envelope. */
export const RECEIPT_ENVELOPE_VERSION = 2;

/**
 * RFC 9180 registry ids for DHKEM(P-256, HKDF-SHA256) / HKDF-SHA256 /
 * AES-256-GCM: CryptoKit `HPKE.Ciphersuite.P256_SHA256_AES_GCM_256` on the
 * device, `DhkemP256HkdfSha256` / `HkdfSha256` / `Aes256Gcm` under
 * `@hpke/core` on the RP and demo legs. All implementations must construct
 * exactly this suite.
 */
export const HPKE_SUITE = Object.freeze({ kem: 0x0010, kdf: 0x0001, aead: 0x0002 } as const);

/** Wire value of the envelope `suite` field; names the `HPKE_SUITE` triple. */
export const HPKE_SUITE_ID = 'HPKE-P256-SHA256-A256GCM';

/**
 * HPKE binding split (frozen; swapping the two inputs yields envelopes that
 * cannot be opened): this fixed context string binds via `info`, mixed into
 * the HPKE key schedule once at context creation (CryptoKit
 * `HPKE.Sender(recipientKey:ciphersuite:info:)` ↔ `@hpke/core`
 * `createRecipientContext({ info })`); `session_id` + `nonce` bind via the
 * per-message AEAD `aad` on each seal/open (see `receiptEnvelopeAad`). Both
 * inputs are raw UTF-8 bytes with no length prefix.
 */
export const RECEIPT_ENVELOPE_INFO = 'meum:sealed-receipt:v2';

/** 0x7c; outside the base64url, `sess_` id, and UUID alphabets, so the aad concatenation cannot be ambiguous. */
export const RECEIPT_ENVELOPE_AAD_SEPARATOR = '|';

/**
 * Per-message AEAD associated data: `UTF-8(session_id) ‖ 0x7c ‖ UTF-8(nonce)`,
 * no length prefixes. Binding the routing identifiers here makes a captured
 * envelope fail AEAD authentication when replayed under a different session.
 */
export function receiptEnvelopeAad(sessionId: string, nonce: string): string {
  return `${sessionId}${RECEIPT_ENVELOPE_AAD_SEPARATOR}${nonce}`;
}

export interface ReceiptHeader {
  alg: 'ES256';
  typ: 'JWT';
  kid: string;
}

export interface ReceiptPayload {
  iss: string;
  aud: string;
  session_id: string;
  nonce: string;
  iat: number;
  exp: number;
  predicate_result: boolean;
  analytics_allowed: boolean;
}

/**
 * Inner claims of a sealed (v2) receipt: the v1 claims plus the RFC 7638
 * SHA-256 thumbprint (unpadded base64url) of the RP encryption key the device
 * sealed to. The RP rejects a receipt whose thumbprint does not match its own
 * key (key-substitution defense).
 */
export interface ReceiptPayloadV2 extends ReceiptPayload {
  rp_key_thumbprint: string;
}

export interface DecodedReceipt {
  header: ReceiptHeader;
  payload: ReceiptPayload;
}

/**
 * Sealed-receipt envelope: the compact ES256 JWS, HPKE-sealed to the RP key
 * named by `kid` (required so the RP can select the matching private key
 * across rotations). `enc` is the 65-byte X9.63 encapsulated key (unpadded
 * base64url); `ct` is the AEAD output (plaintext ‖ 16-byte GCM tag).
 */
export interface EnvelopeV2 {
  v: typeof RECEIPT_ENVELOPE_VERSION;
  suite: typeof HPKE_SUITE_ID;
  kid: string;
  enc: string;
  ct: string;
}

export interface ReceiptCallbackV1 {
  receipt: string;
}

/** v2 body: cleartext routing ids (the same values bound as HPKE aad) plus the sealed envelope. */
export interface ReceiptCallbackV2 {
  session_id: string;
  nonce: string;
  receipt: EnvelopeV2;
}

/**
 * Device→RP receipt callback: `POST return_url` with this JSON body.
 * Version-discriminated by the `receipt` shape (v1 compact JWS string | v2
 * sealed envelope); the v1 arm stays accepted for the rollout window.
 */
export type ReceiptCallback = ReceiptCallbackV1 | ReceiptCallbackV2;
