import type { EcPrivateJwk } from '../src/hpke';
import type { DeviceJwk } from '../src/jwks';
import type { ReceiptCallbackV2 } from '../src/receipt-types';

/**
 * Envelope bindings as the device-side sealer (meum-ios `ReceiptSealer`)
 * emitted them. The parity suite asserts every field byte-identical to this
 * package's frozen constants — the cross-stack drift guard.
 */
export interface SealedParityMeta {
  v: number;
  suite: string;
  info: string;
  aad_separator: string;
  session_id: string;
  nonce: string;
  aad_utf8: string;
  audience: string;
  iat: number;
}

/** An RP recipient key of the matrix; `jwk.d` is TEST-ONLY material. */
export interface SealedParityRecipient {
  kid: string;
  thumbprint: string;
  jwk: EcPrivateJwk;
}

export type SealedParityExpectation = 'valid' | 'open_failed';

export interface SealedParityCase {
  name: string;
  expect: SealedParityExpectation;
  callback: ReceiptCallbackV2;
  /** The compact JWS that was sealed; byte-exact open target for `expect: 'valid'` cases. */
  inner_receipt: string;
  /** Sorted-key envelope serialization; the value `receipt_hash` covers. */
  canonical_envelope_json: string;
  /** Lowercase-hex SHA-256 of `canonical_envelope_json`. */
  receipt_hash: string;
}

/**
 * CryptoKit-sealed envelope matrix (valid, wrong-recipient-key, swapped
 * session_id, swapped nonce, superseded-key) emitted by meum-ios
 * `SealParityMatrixTests` for the `@hpke/core` opener.
 */
export interface SealedParityMatrix {
  meta: SealedParityMeta;
  device_jwk: DeviceJwk;
  recipients: {
    current: SealedParityRecipient;
    superseded: SealedParityRecipient;
  };
  cases: SealedParityCase[];
}
