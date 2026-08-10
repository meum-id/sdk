import { describe, expect, spyOn, test } from 'bun:test';
import {
  DEVICE_JWKS,
  DEVICE_SIGNING_PRIVATE_JWK,
  FIXTURE_EXP,
  FIXTURE_IAT,
  FIXTURE_KID,
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
import {
  computeJwkThumbprint,
  type EcPrivateJwk,
  type EcPublicJwk,
  openFromEnvelope,
  sealToRecipient,
} from '../src/hpke';
import type { Jwks } from '../src/jwks';
import {
  HPKE_SUITE_ID,
  RECEIPT_ENVELOPE_INFO,
  RECEIPT_ENVELOPE_VERSION,
  type ReceiptCallbackV2,
  receiptEnvelopeAad,
} from '../src/receipt-types';
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

describe('runtime dependency budget', () => {
  test('package.json declares @hpke/core and nothing else', async () => {
    const pkg = await Bun.file(new URL('../package.json', import.meta.url)).json();
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(['@hpke/core']);
  });
});

const FIXTURE_RP_KEY_KID = 'rp-key-fixture-2026';

async function generateRpKeyPair(): Promise<{ privateJwk: EcPrivateJwk; publicJwk: EcPublicJwk }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const privateJwk: EcPrivateJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: jwk.x as string,
    y: jwk.y as string,
    d: jwk.d as string,
  };
  const publicJwk: EcPublicJwk = { kty: 'EC', crv: 'P-256', x: privateJwk.x, y: privateJwk.y };
  return { privateJwk, publicJwk };
}

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function signInnerJws(payload: Record<string, unknown>): Promise<string> {
  const headerSegment = b64urlJson({ alg: 'ES256', typ: 'JWT', kid: FIXTURE_KID });
  const payloadSegment = b64urlJson(payload);
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    { ...DEVICE_SIGNING_PRIVATE_JWK, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
  );
  return `${headerSegment}.${payloadSegment}.${Buffer.from(signature).toString('base64url')}`;
}

function v2Payload(thumbprint: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: `device:${FIXTURE_KID}`,
    aud: FIXTURE_RP_ID,
    session_id: FIXTURE_SESSION_ID,
    nonce: FIXTURE_NONCE,
    iat: FIXTURE_IAT,
    exp: FIXTURE_EXP,
    predicate_result: true,
    analytics_allowed: false,
    rp_key_thumbprint: thumbprint,
    ...overrides,
  };
}

async function sealCallback(
  innerJws: string,
  publicJwk: EcPublicJwk,
  { sessionId = FIXTURE_SESSION_ID, nonce = FIXTURE_NONCE }: { sessionId?: string; nonce?: string } = {},
): Promise<ReceiptCallbackV2> {
  const { enc, ct } = await sealToRecipient(
    publicJwk,
    innerJws,
    RECEIPT_ENVELOPE_INFO,
    receiptEnvelopeAad(sessionId, nonce),
  );
  return {
    session_id: sessionId,
    nonce,
    receipt: { v: RECEIPT_ENVELOPE_VERSION, suite: HPKE_SUITE_ID, kid: FIXTURE_RP_KEY_KID, enc, ct },
  };
}

async function sealedFixture() {
  const { privateJwk, publicJwk } = await generateRpKeyPair();
  const thumbprint = await computeJwkThumbprint(publicJwk);
  const innerJws = await signInnerJws(v2Payload(thumbprint));
  const callback = await sealCallback(innerJws, publicJwk);
  return { privateJwk, publicJwk, thumbprint, innerJws, callback };
}

describe('verify: v2 sealed envelope', () => {
  test('seal -> open self round-trip verifies valid (AE1)', async () => {
    const { privateJwk, thumbprint, callback } = await sealedFixture();
    const result = await verify(callback, { ...baseOptions, recipientKey: privateJwk });
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.predicate_result).toBe(true);
    expect((result.payload as { rp_key_thumbprint?: string })?.rp_key_thumbprint).toBe(thumbprint);
  });

  test('openFromEnvelope recovers the exact sealed plaintext', async () => {
    const { privateJwk, innerJws, callback } = await sealedFixture();
    const plaintext = await openFromEnvelope(
      privateJwk,
      callback.receipt,
      RECEIPT_ENVELOPE_INFO,
      receiptEnvelopeAad(callback.session_id, callback.nonce),
    );
    expect(plaintext).toBe(innerJws);
  });

  test('thumbprint of a different key -> thumbprint_mismatch (AE3)', async () => {
    const { privateJwk, publicJwk } = await generateRpKeyPair();
    const { publicJwk: otherPublicJwk } = await generateRpKeyPair();
    const wrongThumbprint = await computeJwkThumbprint(otherPublicJwk);
    const innerJws = await signInnerJws(v2Payload(wrongThumbprint));
    const callback = await sealCallback(innerJws, publicJwk);
    const result = await verify(callback, { ...baseOptions, recipientKey: privateJwk });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('thumbprint_mismatch');
  });

  test('inner payload without rp_key_thumbprint -> malformed_receipt', async () => {
    const { privateJwk, publicJwk } = await generateRpKeyPair();
    const payload = v2Payload('ignored');
    delete payload.rp_key_thumbprint;
    const innerJws = await signInnerJws(payload);
    const callback = await sealCallback(innerJws, publicJwk);
    const result = await verify(callback, { ...baseOptions, recipientKey: privateJwk });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('malformed_receipt');
  });

  test('tampered outer session_id -> open_failed (AE4)', async () => {
    const { privateJwk, callback } = await sealedFixture();
    const tampered = { ...callback, session_id: 'sess_other999' };
    const result = await verify(tampered, { ...baseOptions, recipientKey: privateJwk });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('open_failed');
  });

  test('tampered outer nonce -> open_failed (AE4)', async () => {
    const { privateJwk, callback } = await sealedFixture();
    const tampered = { ...callback, nonce: '9d1a5f22-0c4b-4e7a-8b3c-5e6f7a8b9c0d' };
    const result = await verify(tampered, { ...baseOptions, recipientKey: privateJwk });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('open_failed');
  });

  test('wrong recipient private key -> open_failed, not a signature reason', async () => {
    const { callback } = await sealedFixture();
    const { privateJwk: otherPrivateJwk } = await generateRpKeyPair();
    const result = await verify(callback, { ...baseOptions, recipientKey: otherPrivateJwk });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('open_failed');
  });

  test('inner session_id must match the outer value even without expectedSessionId (KTD2)', async () => {
    const { privateJwk, publicJwk } = await generateRpKeyPair();
    const thumbprint = await computeJwkThumbprint(publicJwk);
    const innerJws = await signInnerJws(v2Payload(thumbprint, { session_id: 'sess_evil0001' }));
    const callback = await sealCallback(innerJws, publicJwk);
    const result = await verify(callback, { ...baseOptions, expectedSessionId: undefined, recipientKey: privateJwk });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('wrong_session');
  });

  test('missing recipientKey for a v2 envelope throws a TypeError', async () => {
    const { callback } = await sealedFixture();
    expect(verify(callback, baseOptions)).rejects.toThrow(TypeError);
  });
});

describe('verify: v2 malformed envelopes', () => {
  test('missing kid -> malformed_envelope', async () => {
    const { privateJwk, callback } = await sealedFixture();
    const { kid: _kid, ...withoutKid } = callback.receipt;
    const result = await verify({ ...callback, receipt: withoutKid } as unknown as ReceiptCallbackV2, {
      ...baseOptions,
      recipientKey: privateJwk,
    });
    expect(result.reason).toBe('malformed_envelope');
  });

  test('enc that is not base64url -> malformed_envelope', async () => {
    const { privateJwk, callback } = await sealedFixture();
    const result = await verify(
      { ...callback, receipt: { ...callback.receipt, enc: '!!!not-b64url!!!' } },
      { ...baseOptions, recipientKey: privateJwk },
    );
    expect(result.reason).toBe('malformed_envelope');
  });

  test('enc that is not a 65-byte X9.63 point -> malformed_envelope', async () => {
    const { privateJwk, callback } = await sealedFixture();
    const truncatedPoint = Buffer.from(Buffer.from(callback.receipt.enc, 'base64url').subarray(1)).toString(
      'base64url',
    );
    const result = await verify(
      { ...callback, receipt: { ...callback.receipt, enc: truncatedPoint } },
      { ...baseOptions, recipientKey: privateJwk },
    );
    expect(result.reason).toBe('malformed_envelope');
  });

  test('ct shorter than a GCM tag -> malformed_envelope', async () => {
    const { privateJwk, callback } = await sealedFixture();
    const truncatedCt = Buffer.from([1, 2, 3]).toString('base64url');
    const result = await verify(
      { ...callback, receipt: { ...callback.receipt, ct: truncatedCt } },
      { ...baseOptions, recipientKey: privateJwk },
    );
    expect(result.reason).toBe('malformed_envelope');
  });

  test('unknown suite string -> malformed_envelope', async () => {
    const { privateJwk, callback } = await sealedFixture();
    const result = await verify(
      {
        ...callback,
        receipt: { ...callback.receipt, suite: 'HPKE-X25519-SHA256-CHACHA' },
      } as unknown as ReceiptCallbackV2,
      { ...baseOptions, recipientKey: privateJwk },
    );
    expect(result.reason).toBe('malformed_envelope');
  });

  test('wrong envelope version -> malformed_envelope', async () => {
    const { privateJwk, callback } = await sealedFixture();
    const result = await verify(
      { ...callback, receipt: { ...callback.receipt, v: 1 } } as unknown as ReceiptCallbackV2,
      { ...baseOptions, recipientKey: privateJwk },
    );
    expect(result.reason).toBe('malformed_envelope');
  });

  test('non-envelope object input -> malformed_envelope', async () => {
    const result = await verify({} as unknown as ReceiptCallbackV2, { ...baseOptions });
    expect(result.reason).toBe('malformed_envelope');
  });
});

// The accepted-version set is the authoritative downgrade-enforcement point:
// these four rows are the mixed-fleet state table (device receipt version x RP
// accepted set). A pre-v2 device cannot observe meum's enc_required flag and
// always sends v1, so this check — not the device refusal — is the security
// boundary. No combination is a stuck-pending session (R9, R10, R11).
describe('verify: accepted-version set (mixed-fleet matrix)', () => {
  test('new device + keyless RP (migration widen): v1 verifies when the set includes 1', async () => {
    const result = await verify(VALID_RECEIPT, { ...baseOptions, acceptedVersions: [1, 2] });
    expect(result.valid).toBe(true);
  });

  test('old device + required RP: v1 -> plaintext_not_accepted when the set is v2-only (AE6)', async () => {
    const result = await verify(VALID_RECEIPT, { ...baseOptions, acceptedVersions: [2] });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('plaintext_not_accepted');
  });

  test('v2 receipt + old verifier: envelope under a v1-only set answers like the legacy verifier (malformed_receipt)', async () => {
    const { privateJwk, callback } = await sealedFixture();
    const result = await verify(callback, { ...baseOptions, acceptedVersions: [1], recipientKey: privateJwk });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('malformed_receipt');
  });

  test('converged fleet: a sealed v2 receipt under a v2-only set verifies', async () => {
    const { privateJwk, callback } = await sealedFixture();
    const result = await verify(callback, { ...baseOptions, acceptedVersions: [2], recipientKey: privateJwk });
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
  });
});

describe('verify: v2 clock handling', () => {
  test('a single now snapshot just inside exp verifies valid', async () => {
    const { privateJwk, callback } = await sealedFixture();
    const result = await verify(callback, { ...baseOptions, now: FIXTURE_EXP - 1, recipientKey: privateJwk });
    expect(result.valid).toBe(true);
  });

  test('now at exp is expired', async () => {
    const { privateJwk, callback } = await sealedFixture();
    const result = await verify(callback, { ...baseOptions, now: FIXTURE_EXP, recipientKey: privateJwk });
    expect(result.reason).toBe('expired');
  });

  test('default clock is snapshotted exactly once across open + verify', async () => {
    const { privateJwk, callback } = await sealedFixture();
    const clock = spyOn(Date, 'now').mockReturnValue((FIXTURE_EXP - 1) * 1000);
    try {
      const result = await verify(callback, { ...baseOptions, now: undefined, recipientKey: privateJwk });
      expect(result.valid).toBe(true);
      expect(clock).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });
});

describe('hpke wrapper guards', () => {
  test('sealToRecipient rejects a public JWK with a short coordinate', async () => {
    const { publicJwk } = await generateRpKeyPair();
    const shortX = Buffer.alloc(31, 7).toString('base64url');
    expect(sealToRecipient({ ...publicJwk, x: shortX }, 'pt', RECEIPT_ENVELOPE_INFO, 'aad')).rejects.toThrow(TypeError);
  });

  test('openFromEnvelope rejects a private JWK with a short d scalar', async () => {
    const { privateJwk, callback } = await sealedFixture();
    const shortD = Buffer.alloc(31, 7).toString('base64url');
    expect(
      openFromEnvelope({ ...privateJwk, d: shortD }, callback.receipt, RECEIPT_ENVELOPE_INFO, 'aad'),
    ).rejects.toThrow(TypeError);
  });
});
