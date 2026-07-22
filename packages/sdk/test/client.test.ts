import { describe, expect, test } from 'bun:test';
import {
  DEVICE_JWKS,
  FIXTURE_KID,
  FIXTURE_NONCE,
  FIXTURE_NOW,
  FIXTURE_RP_ID,
  FIXTURE_SESSION_ID,
  INVALID_PREDICATE_FALSE,
  VALID_RECEIPT,
} from '@meum/verify/fixtures';
import { MeumApiError, MeumClient, MeumExpiredError, MeumNetworkError } from '../src/index';

const SESSION_WIRE_RESPONSE = {
  session_id: 'sess_abc123',
  verification_url: 'https://verify.meum.id/session?id=sess_abc123',
  nonce: '3b46ef7d-4f6a-4c8e-9d6e-6b1a2c3d4e5f',
  expires_at: '2026-07-06T12:05:00Z',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function envelope(status: number, code: number, category: string): Response {
  return jsonResponse(status, {
    error: { code, message: 'nope', category, retryable: false, timestamp: '2026-07-06T12:00:00Z' },
  });
}

interface RecordedCall {
  url: string;
  init?: RequestInit;
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { impl, calls };
}

function client(fetchImpl: typeof fetch, extra?: Partial<ConstructorParameters<typeof MeumClient>[0]>) {
  return new MeumClient({ apiKey: 'mm_test_key', fetch: fetchImpl, ...extra });
}

describe('createSession', () => {
  test('sends the snake_case wire body with the bearer key and camelizes the response', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(200, SESSION_WIRE_RESPONSE));
    const created = await client(impl).createSession({
      predicate: { allOf: ['age_over_18', 'locale_US_CA'] },
      returnUrl: 'https://rp.example.com/verify/callback',
      metadata: { userAgent: 'opaque-stays' },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.meum.id/v1/sessions/create');
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer mm_test_key');
    expect(JSON.parse(calls[0]!.init?.body as string)).toEqual({
      predicate: { all_of: ['age_over_18', 'locale_US_CA'] },
      return_url: 'https://rp.example.com/verify/callback',
      metadata: { userAgent: 'opaque-stays' },
    });

    expect(created).toEqual({
      sessionId: 'sess_abc123',
      verificationUrl: 'https://verify.meum.id/session?id=sess_abc123',
      nonce: '3b46ef7d-4f6a-4c8e-9d6e-6b1a2c3d4e5f',
      expiresAt: '2026-07-06T12:05:00Z',
    });
  });

  test('accepts a bare named claim', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(200, SESSION_WIRE_RESPONSE));
    await client(impl).createSession({
      predicate: 'age_over_21',
      returnUrl: 'https://rp.example.com/verify/callback',
    });
    expect(JSON.parse(calls[0]!.init?.body as string).predicate).toBe('age_over_21');
  });

  test('rejects an invalid predicate before any network call', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(200, SESSION_WIRE_RESPONSE));
    await expect(
      client(impl).createSession({
        predicate: { allOf: [] },
        returnUrl: 'https://rp.example.com/verify/callback',
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  test('maps a 401 envelope to MeumApiError with the frozen code', async () => {
    const { impl } = stubFetch(() => envelope(401, 1001, 'auth'));
    const promise = client(impl).createSession({
      predicate: 'age_over_18',
      returnUrl: 'https://rp.example.com/cb',
    });
    await expect(promise).rejects.toBeInstanceOf(MeumApiError);
    try {
      await promise;
    } catch (error) {
      expect((error as MeumApiError).code).toBe(1001);
      expect((error as MeumApiError).status).toBe(401);
    }
  });

  test('maps a 410 / 2002 envelope to MeumExpiredError', async () => {
    const { impl } = stubFetch(() => envelope(410, 2002, 'session'));
    await expect(
      client(impl).createSession({ predicate: 'age_over_18', returnUrl: 'https://rp.example.com/cb' }),
    ).rejects.toBeInstanceOf(MeumExpiredError);
  });

  test('maps a transport failure to MeumNetworkError', async () => {
    const { impl } = stubFetch(() => {
      throw new TypeError('connection refused');
    });
    await expect(
      client(impl).createSession({ predicate: 'age_over_18', returnUrl: 'https://rp.example.com/cb' }),
    ).rejects.toBeInstanceOf(MeumNetworkError);
  });
});

describe('deepLink', () => {
  test('builds the exact verification URL', () => {
    const { impl } = stubFetch(() => jsonResponse(200, {}));
    expect(client(impl).deepLink('sess_abc123')).toBe('https://verify.meum.id/session?id=sess_abc123');
  });
});

describe('verifyReceipt', () => {
  const verifyOptions = {
    expectedAudience: FIXTURE_RP_ID,
    expectedNonce: FIXTURE_NONCE,
    expectedSessionId: FIXTURE_SESSION_ID,
    now: FIXTURE_NOW,
  };

  test('verifies the valid fixture against the fetched JWKS', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(200, DEVICE_JWKS));
    const result = await client(impl).verifyReceipt(VALID_RECEIPT, verifyOptions);
    expect(result.valid).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`https://api.meum.id/v1/.well-known/jwks.json?kid=${FIXTURE_KID}`);
  });

  test('rejects the predicate-false fixture', async () => {
    const { impl } = stubFetch(() => jsonResponse(200, DEVICE_JWKS));
    const result = await client(impl).verifyReceipt(INVALID_PREDICATE_FALSE, verifyOptions);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('predicate_false');
  });

  test('JWKS cache hit avoids a refetch', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(200, DEVICE_JWKS));
    const meum = client(impl);
    await meum.verifyReceipt(VALID_RECEIPT, verifyOptions);
    await meum.verifyReceipt(VALID_RECEIPT, verifyOptions);
    expect(calls).toHaveLength(1);
  });

  test('expired cache entry refetches', async () => {
    let now = 1_000_000;
    const { impl, calls } = stubFetch(() => jsonResponse(200, DEVICE_JWKS));
    const meum = client(impl, { nowMs: () => now });
    await meum.verifyReceipt(VALID_RECEIPT, verifyOptions);
    now += 3_600_001;
    await meum.verifyReceipt(VALID_RECEIPT, verifyOptions);
    expect(calls).toHaveLength(2);
  });

  test('a cached-key miss force-refreshes and verifies against the fresh JWKS', async () => {
    const staleJwks = {
      keys: [{ ...DEVICE_JWKS.keys[0]!, kid: 'kid_stale_other' }],
    };
    let served = 0;
    const { impl, calls } = stubFetch(() => {
      served += 1;
      return jsonResponse(200, served === 1 ? staleJwks : DEVICE_JWKS);
    });
    const meum = client(impl);

    const first = await meum.verifyReceipt(VALID_RECEIPT, verifyOptions);
    expect(first.valid).toBe(false);
    expect(first.reason).toBe('unknown_kid');
    expect(calls).toHaveLength(1);

    const second = await meum.verifyReceipt(VALID_RECEIPT, verifyOptions);
    expect(second.valid).toBe(true);
    expect(calls).toHaveLength(2);
  });

  test('JWKS 404 (revoked or unknown) yields unknown_kid without a retry loop', async () => {
    const { impl, calls } = stubFetch(() => envelope(404, 3003, 'key'));
    const result = await client(impl).verifyReceipt(VALID_RECEIPT, verifyOptions);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('unknown_kid');
    expect(calls).toHaveLength(1);
  });
});

describe('registerKeyDomain', () => {
  const WIRE_RESPONSE = { rp_id: 'rp_example_123', rp_key_domain: 'https://rp.example.com' };

  test('POSTs the snake_case wire body with the bearer key and camelizes the response', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(200, WIRE_RESPONSE));
    const registered = await client(impl).registerKeyDomain({ keyDomain: 'rp.example.com', kid: 'rpk-2026' });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.meum.id/v1/rp/keys/domain');
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer mm_test_key');
    expect(JSON.parse(calls[0]!.init?.body as string)).toEqual({
      rp_key_domain: 'https://rp.example.com',
      kid: 'rpk-2026',
    });
    expect(registered).toEqual({ rpId: 'rp_example_123', rpKeyDomain: 'https://rp.example.com' });
  });

  test('emits the full normalized https origin and omits an absent kid', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(200, WIRE_RESPONSE));
    await client(impl).registerKeyDomain({ keyDomain: 'https://RP.Example.com' });
    const wire = JSON.parse(calls[0]!.init?.body as string) as { rp_key_domain: string };
    expect(wire).toEqual({ rp_key_domain: 'https://rp.example.com' });
    // Contract invariant mirrored from the server's HttpsOriginSchema: the wire
    // value must be its own canonical origin.
    expect(wire.rp_key_domain).toBe(new URL(wire.rp_key_domain).origin);
  });

  test('preserves a non-default port in origin form', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(200, WIRE_RESPONSE));
    await client(impl).registerKeyDomain({ keyDomain: 'rp.example.com:8443' });
    const wire = JSON.parse(calls[0]!.init?.body as string) as { rp_key_domain: string };
    expect(wire.rp_key_domain).toBe('https://rp.example.com:8443');
    expect(wire.rp_key_domain).toBe(new URL(wire.rp_key_domain).origin);
  });

  test('rejects an IP-literal host before any network call', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(200, WIRE_RESPONSE));
    await expect(client(impl).registerKeyDomain({ keyDomain: '203.0.113.7' })).rejects.toThrow();
    await expect(client(impl).registerKeyDomain({ keyDomain: 'https://[2001:db8::1]' })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  test('rejects a non-https scheme before any network call', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(200, WIRE_RESPONSE));
    await expect(client(impl).registerKeyDomain({ keyDomain: 'http://rp.example.com' })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  test('rejects a path-bearing key-domain value before any network call', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(200, WIRE_RESPONSE));
    await expect(client(impl).registerKeyDomain({ keyDomain: 'https://rp.example.com/keys' })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  test('maps an error envelope to MeumApiError', async () => {
    const { impl } = stubFetch(() => envelope(403, 1003, 'auth'));
    await expect(client(impl).registerKeyDomain({ keyDomain: 'rp.example.com' })).rejects.toBeInstanceOf(MeumApiError);
  });

  test('a malformed success body is a MeumNetworkError', async () => {
    const { impl } = stubFetch(() => jsonResponse(200, { unexpected: true }));
    await expect(client(impl).registerKeyDomain({ keyDomain: 'rp.example.com' })).rejects.toBeInstanceOf(
      MeumNetworkError,
    );
  });
});

describe('init cost', () => {
  test('client construction is under 10ms', () => {
    const { impl } = stubFetch(() => jsonResponse(200, {}));
    const start = performance.now();
    client(impl);
    expect(performance.now() - start).toBeLessThan(10);
  });
});
