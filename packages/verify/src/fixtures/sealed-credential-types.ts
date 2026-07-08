/**
 * Wire-shape types for the sealed-credential envelope. Hand-mirrored from
 * `@meum/contracts` so this package carries zero runtime dependencies.
 */

export interface X25519Jwk {
  kty: 'OKP';
  crv: 'X25519';
  x: string;
}

export interface SealedCredentialEnvelope {
  epk: X25519Jwk;
  nonce: string;
  ciphertext: string;
}

export interface CredentialPayload {
  date_of_birth: string;
  sex: 'M' | 'F' | 'X';
  locale: string;
  kyc_iat: number;
  exp: number;
}
