/**
 * RP encryption-key lifecycle: mint the P-256 recipient keypair the device
 * seals receipts to, export the publishable public JWK, and rotate a keyring
 * that retains superseded private keys long enough to open in-flight
 * receipts. The private key never leaves the RP.
 */

import { assertRecipientPrivateJwk, computeJwkThumbprint, type EcPrivateJwk, type EcPublicJwk } from '@meum/verify';

/** Private JWK plus the key id it is published and selected under. */
export type RpPrivateJwk = EcPrivateJwk & { kid: string };

/** Public JWK as served at `/.well-known/meum-encryption-key.json`. */
export type RpPublicJwk = EcPublicJwk & { kid: string };

export interface RpEncryptionKey {
  /** Key id; defaults to the RFC 7638 thumbprint, so the id self-authenticates. */
  kid: string;
  /** RFC 7638 thumbprint of the public key — the value devices sign into `rp_key_thumbprint`. */
  thumbprint: string;
  privateJwk: RpPrivateJwk;
  publicJwk: RpPublicJwk;
}

/** One keyring entry; the entry without `supersededAt` is the current key. */
export interface RpKeyringEntry {
  kid: string;
  jwk: EcPrivateJwk;
  /** ISO 8601 instant this key stopped being current. */
  supersededAt?: string;
}

/**
 * How long a superseded private key stays usable for opening envelopes.
 * Floor: at least session TTL (300s) + receipt TTL (300s), so every
 * receipt sealed to the old key while its session was in flight still opens;
 * one hour leaves ample slack for clock skew and delivery retries.
 */
export const RP_KEY_RETENTION_SECONDS = 3600;

/** Mints a fresh P-256 recipient keypair via WebCrypto. */
export async function generateRpEncryptionKey(): Promise<RpEncryptionKey> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const exported = await crypto.subtle.exportKey('jwk', pair.privateKey);
  if (typeof exported.x !== 'string' || typeof exported.y !== 'string' || typeof exported.d !== 'string') {
    throw new TypeError('@meum/sdk: WebCrypto returned an incomplete P-256 private JWK');
  }
  const bare: EcPrivateJwk = { kty: 'EC', crv: 'P-256', x: exported.x, y: exported.y, d: exported.d };
  assertRecipientPrivateJwk(bare);
  const thumbprint = await computeJwkThumbprint(bare);
  const privateJwk: RpPrivateJwk = { ...bare, kid: thumbprint };
  return { kid: thumbprint, thumbprint, privateJwk, publicJwk: publicEncryptionJwk(privateJwk) };
}

/** Publishable public JWK for a private key: same coordinates and kid, no scalar. */
export function publicEncryptionJwk(privateJwk: RpPrivateJwk): RpPublicJwk {
  return { kty: privateJwk.kty, crv: privateJwk.crv, x: privateJwk.x, y: privateJwk.y, kid: privateJwk.kid };
}

/**
 * Rotates the keyring to a new current key: the previous current entry is
 * marked superseded at `now`, the new key is installed first, and entries
 * superseded longer than `RP_KEY_RETENTION_SECONDS` ago are dropped. Pure —
 * callers persist the returned keyring and republish the public JWK.
 */
export function rotateRpKeyring(
  keyring: readonly RpKeyringEntry[],
  next: RpEncryptionKey,
  now: Date = new Date(),
): RpKeyringEntry[] {
  const cutoffMs = now.getTime() - RP_KEY_RETENTION_SECONDS * 1000;
  const retained = keyring
    .map((entry) => ({ ...entry, supersededAt: entry.supersededAt ?? now.toISOString() }))
    .filter((entry) => Date.parse(entry.supersededAt) > cutoffMs);
  return [{ kid: next.kid, jwk: next.privateJwk }, ...retained];
}
