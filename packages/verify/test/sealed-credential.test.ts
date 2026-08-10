import { describe, expect, test } from 'bun:test';
import { CredentialPayloadSchema } from '@meum/contracts';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64UrlToBytes, base64UrlToUtf8 } from '../src/b64url';
import {
  CREDENTIAL_JWT,
  CREDENTIAL_PAYLOAD,
  DEVICE_X25519_PRIVATE_KEY_B64URL,
  FIXTURE_ISSUER_KID,
  ISSUER_JWKS,
  SEALED_CREDENTIAL,
} from '../src/fixtures/index';

function openEnvelope(): string {
  const devicePrivate = base64UrlToBytes(DEVICE_X25519_PRIVATE_KEY_B64URL);
  const backendEphemeralPublic = base64UrlToBytes(SEALED_CREDENTIAL.epk.x);
  const sharedSecret = x25519.getSharedSecret(devicePrivate, backendEphemeralPublic);
  const key = hkdf(sha256, sharedSecret, undefined, 'meum-enrollment-v1', 32);
  const nonce = base64UrlToBytes(SEALED_CREDENTIAL.nonce);
  const plaintext = xchacha20poly1305(key, nonce).decrypt(base64UrlToBytes(SEALED_CREDENTIAL.ciphertext));
  return new TextDecoder().decode(plaintext);
}

describe('sealed credential fixture', () => {
  test('the device X25519 test key opens the envelope', () => {
    expect(openEnvelope()).toBe(CREDENTIAL_JWT);
  });

  test('the issuer signature on the sealed credential verifies', async () => {
    const [headerSegment, payloadSegment, signatureSegment] = CREDENTIAL_JWT.split('.') as [string, string, string];
    const header = JSON.parse(base64UrlToUtf8(headerSegment));
    expect(header.alg).toBe('ES256');
    expect(header.kid).toBe(FIXTURE_ISSUER_KID);

    const issuerJwk = ISSUER_JWKS.keys[0];
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: issuerJwk.kty, crv: issuerJwk.crv, x: issuerJwk.x, y: issuerJwk.y },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      base64UrlToBytes(signatureSegment),
      new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
    );
    expect(valid).toBe(true);
  });

  test('the credential payload matches the frozen shape', () => {
    const [, payloadSegment] = CREDENTIAL_JWT.split('.');
    const payload = JSON.parse(base64UrlToUtf8(payloadSegment!));
    expect(CredentialPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload).toEqual(CREDENTIAL_PAYLOAD);
    expect(payload.exp - payload.kyc_iat).toBe(31_536_000);
  });
});
