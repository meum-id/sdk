/**
 * Wire-shape types for the device-minted receipt JWT. Hand-mirrored from
 * `@meum/contracts` so this package carries zero runtime dependencies.
 */

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

export interface DecodedReceipt {
  header: ReceiptHeader;
  payload: ReceiptPayload;
}
