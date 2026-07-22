/**
 * Thin wrappers over `@hpke/core` for the sealed-receipt envelope: the RP-side
 * open and the demo/parity-side seal share this one implementation, so both
 * legs stay byte-compatible with the device's CryptoKit `HPKE` sealer.
 */

import type { CipherSuite } from '@hpke/core';
import { base64UrlToBytes, bytesToBase64Url } from './b64url';
import { type EnvelopeV2, HPKE_SUITE } from './receipt-types';

/** RP encryption public key as published at the RP's key endpoint. */
export interface EcPublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  kid?: string;
}

/** RP recipient private key; `d` never leaves the RP. */
export interface EcPrivateJwk extends EcPublicJwk {
  d: string;
}

let suitePromise: Promise<CipherSuite> | undefined;

/**
 * `@hpke/core` loads on first seal/open so bundles that only verify v1
 * plaintext receipts (e.g. @meum/sdk's size-budgeted client) never carry it.
 */
async function hpkeSuite(): Promise<CipherSuite> {
  suitePromise ??= (async () => {
    const { Aes256Gcm, CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } = await import('@hpke/core');
    const suite = new CipherSuite({
      kem: new DhkemP256HkdfSha256(),
      kdf: new HkdfSha256(),
      aead: new Aes256Gcm(),
    });
    // Fail on first use if the constructed suite ever drifts from the frozen
    // wire contract — a mismatch would seal envelopes no device or RP can open.
    if (suite.kem.id !== HPKE_SUITE.kem || suite.kdf.id !== HPKE_SUITE.kdf || suite.aead.id !== HPKE_SUITE.aead) {
      throw new Error('@meum/verify: constructed HPKE suite does not match the frozen HPKE_SUITE ids');
    }
    return suite;
  })();
  return suitePromise;
}

const COORDINATE_BYTES = 32;

function utf8(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>;
}

function b64urlByteLength(value: string | undefined): number {
  if (typeof value !== 'string') {
    return -1;
  }
  try {
    return base64UrlToBytes(value).length;
  } catch {
    return -1;
  }
}

/**
 * Rejects keys whose coordinates are not exactly 32 bytes: leading-zero-
 * stripping JWK emitters produce keys that WebCrypto and CryptoKit disagree
 * on, so they are refused at the boundary instead of failing cross-stack.
 */
export function assertRecipientPublicJwk(jwk: EcPublicJwk): void {
  if (
    jwk.kty !== 'EC' ||
    jwk.crv !== 'P-256' ||
    b64urlByteLength(jwk.x) !== COORDINATE_BYTES ||
    b64urlByteLength(jwk.y) !== COORDINATE_BYTES
  ) {
    throw new TypeError('@meum/verify: recipient key must be a P-256 JWK with 32-byte x and y coordinates');
  }
}

export function assertRecipientPrivateJwk(jwk: EcPrivateJwk): void {
  assertRecipientPublicJwk(jwk);
  if (b64urlByteLength(jwk.d) !== COORDINATE_BYTES) {
    throw new TypeError('@meum/verify: recipient private JWK must carry a 32-byte d scalar');
  }
}

/**
 * RFC 7638 JWK thumbprint (unpadded base64url SHA-256 of the canonical
 * `{"crv","kty","x","y"}` member set) — the value the device signs into the
 * inner `rp_key_thumbprint` claim and the RP compares against its own key.
 */
export async function computeJwkThumbprint(jwk: EcPublicJwk | EcPrivateJwk): Promise<string> {
  // RFC 7638 §3.2: required members only, lexicographic order, no whitespace.
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  const digest = await crypto.subtle.digest('SHA-256', utf8(canonical));
  return bytesToBase64Url(new Uint8Array(digest));
}

/**
 * HPKE-seal `plaintext` to the RP public key. Returns wire-ready unpadded
 * base64url values for an `EnvelopeV2`: `enc` (65-byte X9.63 point) and `ct`
 * (AEAD output with the 16-byte GCM tag appended). `info` binds at context
 * creation; `aad` binds per message — the same split CryptoKit uses.
 */
export async function sealToRecipient(
  pubJwk: EcPublicJwk,
  plaintext: string,
  info: string,
  aad: string,
): Promise<{ enc: string; ct: string }> {
  assertRecipientPublicJwk(pubJwk);
  const suite = await hpkeSuite();
  const recipientPublicKey = await suite.kem.importKey(
    'jwk',
    { kty: pubJwk.kty, crv: pubJwk.crv, x: pubJwk.x, y: pubJwk.y },
    true,
  );
  const sender = await suite.createSenderContext({ recipientPublicKey, info: utf8(info) });
  const ct = await sender.seal(utf8(plaintext), utf8(aad));
  return { enc: bytesToBase64Url(new Uint8Array(sender.enc)), ct: bytesToBase64Url(new Uint8Array(ct)) };
}

/**
 * Opens a sealed envelope with the RP private key and returns the inner
 * plaintext (the compact JWS). Throws on any decap or AEAD failure, including
 * a tampered `aad`; callers map failures to a reason code rather than
 * surfacing the library error.
 */
export async function openFromEnvelope(
  privKey: CryptoKey | EcPrivateJwk,
  envelope: EnvelopeV2,
  info: string,
  aad: string,
): Promise<string> {
  const suite = await hpkeSuite();
  let recipientKey: CryptoKey;
  if (privKey instanceof CryptoKey) {
    recipientKey = privKey;
  } else {
    assertRecipientPrivateJwk(privKey);
    recipientKey = await suite.kem.importKey(
      'jwk',
      { kty: privKey.kty, crv: privKey.crv, x: privKey.x, y: privKey.y, d: privKey.d },
      false,
    );
  }
  const recipient = await suite.createRecipientContext({
    recipientKey,
    enc: base64UrlToBytes(envelope.enc),
    info: utf8(info),
  });
  const plaintext = await recipient.open(base64UrlToBytes(envelope.ct), utf8(aad));
  return new TextDecoder().decode(plaintext);
}
