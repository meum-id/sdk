/**
 * Wire-shape types for the Meum device JWKS. Hand-mirrored from
 * `@meum/contracts` so this package carries zero runtime dependencies.
 */

export interface DeviceJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  kid: string;
  alg: 'ES256';
  use: 'sig';
}

export interface DeviceJwksEntry extends DeviceJwk {
  status?: 'active' | 'revoked';
  registered_at?: string;
}

export interface Jwks {
  keys: DeviceJwksEntry[];
}

/**
 * Resolves the JWKS document for one `kid`, typically from
 * `GET /v1/.well-known/jwks.json?kid=…`. Return `null` when the JWKS
 * endpoint 404s (unknown or revoked key).
 */
export type JwksResolver = (kid: string) => Promise<Jwks | null>;
