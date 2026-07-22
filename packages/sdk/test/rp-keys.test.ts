import { describe, expect, test } from 'bun:test';
import {
  assertRecipientPrivateJwk,
  computeJwkThumbprint,
  openFromEnvelope,
  RECEIPT_ENVELOPE_INFO,
  receiptEnvelopeAad,
  sealToRecipient,
} from '@meum/verify';
import {
  generateRpEncryptionKey,
  publicEncryptionJwk,
  RP_KEY_RETENTION_SECONDS,
  type RpKeyringEntry,
  rotateRpKeyring,
} from '../src/index';

describe('generateRpEncryptionKey', () => {
  test('mints a P-256 keypair that passes the recipient-key boundary guard', async () => {
    const key = await generateRpEncryptionKey();
    expect(() => assertRecipientPrivateJwk(key.privateJwk)).not.toThrow();
    expect(key.privateJwk.kty).toBe('EC');
    expect(key.privateJwk.crv).toBe('P-256');
  });

  test('kid and thumbprint are the RFC 7638 thumbprint of the public key', async () => {
    const key = await generateRpEncryptionKey();
    const expected = await computeJwkThumbprint(key.publicJwk);
    expect(key.thumbprint).toBe(expected);
    expect(key.kid).toBe(expected);
    expect(key.publicJwk.kid).toBe(expected);
    expect(key.privateJwk.kid).toBe(expected);
  });

  test('the public JWK carries no private scalar', async () => {
    const key = await generateRpEncryptionKey();
    expect('d' in key.publicJwk).toBe(false);
  });

  test('successive keys are distinct', async () => {
    const first = await generateRpEncryptionKey();
    const second = await generateRpEncryptionKey();
    expect(first.kid).not.toBe(second.kid);
    expect(first.privateJwk.d).not.toBe(second.privateJwk.d);
  });

  test('a generated key seals and opens through the @meum/verify HPKE path', async () => {
    const key = await generateRpEncryptionKey();
    const aad = receiptEnvelopeAad('sess_rpkeys01', 'nonce-rpkeys');
    const { enc, ct } = await sealToRecipient(key.publicJwk, 'inner-jws', RECEIPT_ENVELOPE_INFO, aad);
    const opened = await openFromEnvelope(
      key.privateJwk,
      { v: 2, suite: 'HPKE-P256-SHA256-A256GCM', kid: key.kid, enc, ct },
      RECEIPT_ENVELOPE_INFO,
      aad,
    );
    expect(opened).toBe('inner-jws');
  });
});

describe('publicEncryptionJwk', () => {
  test('strips the private scalar and preserves coordinates and kid', async () => {
    const key = await generateRpEncryptionKey();
    const publicJwk = publicEncryptionJwk(key.privateJwk);
    expect(publicJwk).toEqual({ kty: 'EC', crv: 'P-256', x: key.privateJwk.x, y: key.privateJwk.y, kid: key.kid });
  });
});

describe('rotateRpKeyring', () => {
  const now = new Date('2026-07-22T12:00:00Z');

  test('retention window is at least the R8 floor (session TTL + receipt TTL)', () => {
    expect(RP_KEY_RETENTION_SECONDS).toBeGreaterThanOrEqual(600);
  });

  test('marks the current key superseded and installs the new key as current', async () => {
    const oldKey = await generateRpEncryptionKey();
    const newKey = await generateRpEncryptionKey();
    const keyring: RpKeyringEntry[] = [{ kid: oldKey.kid, jwk: oldKey.privateJwk }];

    const rotated = rotateRpKeyring(keyring, newKey, now);
    expect(rotated).toHaveLength(2);
    expect(rotated[0]).toEqual({ kid: newKey.kid, jwk: newKey.privateJwk });
    expect(rotated[1]?.kid).toBe(oldKey.kid);
    expect(rotated[1]?.supersededAt).toBe(now.toISOString());
  });

  test('keeps superseded keys inside the retention window', async () => {
    const oldKey = await generateRpEncryptionKey();
    const midKey = await generateRpEncryptionKey();
    const newKey = await generateRpEncryptionKey();
    const withinWindow = new Date(now.getTime() - (RP_KEY_RETENTION_SECONDS - 60) * 1000).toISOString();
    const keyring: RpKeyringEntry[] = [
      { kid: midKey.kid, jwk: midKey.privateJwk },
      { kid: oldKey.kid, jwk: oldKey.privateJwk, supersededAt: withinWindow },
    ];

    const rotated = rotateRpKeyring(keyring, newKey, now);
    expect(rotated.map((entry) => entry.kid)).toEqual([newKey.kid, midKey.kid, oldKey.kid]);
  });

  test('drops keys superseded longer than the retention window ago', async () => {
    const staleKey = await generateRpEncryptionKey();
    const currentKey = await generateRpEncryptionKey();
    const newKey = await generateRpEncryptionKey();
    const beyondWindow = new Date(now.getTime() - (RP_KEY_RETENTION_SECONDS + 60) * 1000).toISOString();
    const keyring: RpKeyringEntry[] = [
      { kid: currentKey.kid, jwk: currentKey.privateJwk },
      { kid: staleKey.kid, jwk: staleKey.privateJwk, supersededAt: beyondWindow },
    ];

    const rotated = rotateRpKeyring(keyring, newKey, now);
    expect(rotated.map((entry) => entry.kid)).toEqual([newKey.kid, currentKey.kid]);
  });
});
