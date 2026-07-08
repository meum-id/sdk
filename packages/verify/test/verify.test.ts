import { describe, expect, test } from 'bun:test';
import {
  DEVICE_JWKS,
  FIXTURE_NONCE,
  FIXTURE_NOW,
  FIXTURE_RP_ID,
  FIXTURE_SESSION_ID,
  INVALID_BAD_SIGNATURE,
  INVALID_EXPIRED,
  INVALID_PREDICATE_FALSE,
  INVALID_UNKNOWN_KID,
  INVALID_WRONG_AUD,
  INVALID_WRONG_NONCE,
  VALID_RECEIPT,
} from '../src/fixtures/index';
import type { Jwks } from '../src/jwks';
import { verify } from '../src/verify';

const baseOptions = {
  jwks: DEVICE_JWKS,
  expectedAudience: FIXTURE_RP_ID,
  expectedNonce: FIXTURE_NONCE,
  expectedSessionId: FIXTURE_SESSION_ID,
  now: FIXTURE_NOW,
};

describe('verify: valid receipt', () => {
  test('verifies with a static JWKS', async () => {
    const result = await verify(VALID_RECEIPT, baseOptions);
    expect(result.valid).toBe(true);
    expect(result.predicate_result).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.payload?.session_id).toBe(FIXTURE_SESSION_ID);
  });

  test('verifies with a jwksResolver', async () => {
    const result = await verify(VALID_RECEIPT, {
      ...baseOptions,
      jwks: undefined,
      jwksResolver: async () => DEVICE_JWKS,
    });
    expect(result.valid).toBe(true);
  });

  test('accepts a Date for now', async () => {
    const result = await verify(VALID_RECEIPT, { ...baseOptions, now: new Date(FIXTURE_NOW * 1000) });
    expect(result.valid).toBe(true);
  });
});

describe('verify: invalid variants', () => {
  test('bad signature', async () => {
    const result = await verify(INVALID_BAD_SIGNATURE, baseOptions);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('bad_signature');
  });

  test('wrong aud', async () => {
    const result = await verify(INVALID_WRONG_AUD, baseOptions);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('wrong_audience');
  });

  test('expired', async () => {
    const result = await verify(INVALID_EXPIRED, baseOptions);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  test('valid receipt fails once past exp', async () => {
    const result = await verify(VALID_RECEIPT, { ...baseOptions, now: FIXTURE_NOW + 400 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  test('wrong nonce', async () => {
    const result = await verify(INVALID_WRONG_NONCE, baseOptions);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('wrong_nonce');
  });

  test('wrong session', async () => {
    const result = await verify(VALID_RECEIPT, { ...baseOptions, expectedSessionId: 'sess_other999' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('wrong_session');
  });

  test('predicate_result false', async () => {
    const result = await verify(INVALID_PREDICATE_FALSE, baseOptions);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('predicate_false');
    expect(result.predicate_result).toBe(false);
  });

  test('kid not in JWKS', async () => {
    const result = await verify(INVALID_UNKNOWN_KID, baseOptions);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('unknown_kid');
  });

  test('revoked key (JWKS 404 -> resolver null)', async () => {
    const result = await verify(VALID_RECEIPT, {
      ...baseOptions,
      jwks: undefined,
      jwksResolver: async () => null,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('unknown_kid');
  });

  test('key marked revoked in a static JWKS', async () => {
    const revokedJwks: Jwks = {
      keys: DEVICE_JWKS.keys.map((key) => ({ ...key, status: 'revoked' as const })),
    };
    const result = await verify(VALID_RECEIPT, { ...baseOptions, jwks: revokedJwks });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('key_not_active');
  });

  test('malformed receipt', async () => {
    const result = await verify('not-a-jwt', baseOptions);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('malformed_receipt');
  });

  test('unsupported algorithm', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: 'kid_fixture001' })).toString(
      'base64url',
    );
    const [, payload, signature] = VALID_RECEIPT.split('.');
    const result = await verify(`${header}.${payload}.${signature}`, baseOptions);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('unsupported_algorithm');
  });
});

describe('zero runtime dependencies', () => {
  test('package.json declares no dependencies', async () => {
    const pkg = await Bun.file(new URL('../package.json', import.meta.url)).json();
    expect(pkg.dependencies).toBeUndefined();
  });
});
