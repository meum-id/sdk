import { afterAll, describe, expect, test } from 'bun:test';
import {
  DeviceJwksResponseSchema,
  EnrollmentInitResponseSchema,
  EnrollmentPollResponseSchema,
  ErrorEnvelopeSchema,
  IssuerJwksResponseSchema,
  KeyRevokeResponseSchema,
  KeysRegisterResponseSchema,
  SessionCreateResponseSchema,
  SessionGetResponseSchema,
  UsageEventResponseSchema,
} from '@meum/contracts';
import { Miniflare } from 'miniflare';
import {
  FIXTURE_DEVICE_ID,
  FIXTURE_EXPIRED_SESSION_ID,
  FIXTURE_KID,
  FIXTURE_PENDING_DEVICE_ID,
  FIXTURE_REVOKED_KID,
  FIXTURE_SESSION_ID,
  FIXTURE_UNKNOWN_KID,
} from '../src/fixtures/index';
import { handleRequest } from '../src/mock-worker';

const BASE = 'https://mock.meum.test';

function request(method: string, path: string, init?: RequestInit): Request {
  return new Request(`${BASE}${path}`, { method, ...init });
}

const AUTH = { headers: { authorization: 'Bearer mm_test_key' } };

describe('mock worker endpoints return schema-valid fixtures', () => {
  test('POST /v1/sessions/create -> 200', async () => {
    const response = await handleRequest(request('POST', '/v1/sessions/create', AUTH));
    expect(response.status).toBe(200);
    expect(SessionCreateResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  test('POST /v1/sessions/create without a bearer key -> 401 envelope 1001', async () => {
    const response = await handleRequest(request('POST', '/v1/sessions/create'));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(ErrorEnvelopeSchema.safeParse(body).success).toBe(true);
    expect((body as { error: { code: number } }).error.code).toBe(1001);
  });

  test('GET /v1/sessions/{id} -> 200 for the fixture session', async () => {
    const response = await handleRequest(request('GET', `/v1/sessions/${FIXTURE_SESSION_ID}`));
    expect(response.status).toBe(200);
    expect(SessionGetResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  test('GET /v1/sessions/{id} -> 410 for the expired fixture', async () => {
    const response = await handleRequest(request('GET', `/v1/sessions/${FIXTURE_EXPIRED_SESSION_ID}`));
    expect(response.status).toBe(410);
    const body = await response.json();
    expect((body as { error: { code: number } }).error.code).toBe(2002);
  });

  test('GET /v1/sessions/{id} -> 404 otherwise', async () => {
    const response = await handleRequest(request('GET', '/v1/sessions/sess_nope'));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect((body as { error: { code: number } }).error.code).toBe(2001);
  });

  test('POST /v1/keys/register -> 201 with Location', async () => {
    const response = await handleRequest(request('POST', '/v1/keys/register'));
    expect(response.status).toBe(201);
    expect(response.headers.get('location')).toBe(`/v1/keys/${FIXTURE_KID}`);
    expect(KeysRegisterResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  test('POST /v1/keys/{kid}/revoke -> 200 / 409 / 404', async () => {
    const ok = await handleRequest(request('POST', `/v1/keys/${FIXTURE_KID}/revoke`));
    expect(ok.status).toBe(200);
    expect(KeyRevokeResponseSchema.safeParse(await ok.json()).success).toBe(true);

    const already = await handleRequest(request('POST', `/v1/keys/${FIXTURE_REVOKED_KID}/revoke`));
    expect(already.status).toBe(409);

    const missing = await handleRequest(request('POST', '/v1/keys/kid_nope/revoke'));
    expect(missing.status).toBe(404);
  });

  test('POST /v1/events/usage -> 200 recorded', async () => {
    const response = await handleRequest(request('POST', '/v1/events/usage'));
    expect(response.status).toBe(200);
    expect(UsageEventResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  test('GET jwks.json?kid=<fixture> -> 200 single key', async () => {
    const response = await handleRequest(request('GET', `/v1/.well-known/jwks.json?kid=${FIXTURE_KID}`));
    expect(response.status).toBe(200);
    expect(DeviceJwksResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  test('GET jwks.json unknown kid or missing kid -> 404', async () => {
    const unknown = await handleRequest(request('GET', `/v1/.well-known/jwks.json?kid=${FIXTURE_UNKNOWN_KID}`));
    expect(unknown.status).toBe(404);
    const missing = await handleRequest(request('GET', '/v1/.well-known/jwks.json'));
    expect(missing.status).toBe(404);
  });

  test('GET issuer-jwks.json -> 200', async () => {
    const response = await handleRequest(request('GET', '/v1/.well-known/issuer-jwks.json'));
    expect(response.status).toBe(200);
    expect(IssuerJwksResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  test('POST /v1/enrollment/init -> 202 session_url', async () => {
    const response = await handleRequest(request('POST', '/v1/enrollment/init'));
    expect(response.status).toBe(202);
    expect(EnrollmentInitResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  test('GET /v1/enrollment/{device_id} -> 200 sealed / 202 pending / 410 expired', async () => {
    const sealed = await handleRequest(request('GET', `/v1/enrollment/${FIXTURE_DEVICE_ID}`));
    expect(sealed.status).toBe(200);
    expect(EnrollmentPollResponseSchema.safeParse(await sealed.json()).success).toBe(true);

    const pending = await handleRequest(request('GET', `/v1/enrollment/${FIXTURE_PENDING_DEVICE_ID}`));
    expect(pending.status).toBe(202);

    const expired = await handleRequest(request('GET', '/v1/enrollment/device_gone_999'));
    expect(expired.status).toBe(410);
  });

  test('unknown route -> 404 envelope', async () => {
    const response = await handleRequest(request('GET', '/v1/nope'));
    expect(response.status).toBe(404);
    expect(ErrorEnvelopeSchema.safeParse(await response.json()).success).toBe(true);
  });
});

describe('mock worker under Miniflare (workerd)', () => {
  let mf: Miniflare | undefined;

  afterAll(async () => {
    await mf?.dispose();
  });

  test('serves the fixture session and JWKS', async () => {
    const bundle = await Bun.build({
      entrypoints: [new URL('../src/mock-worker.ts', import.meta.url).pathname],
      target: 'browser',
      format: 'esm',
    });
    const script = await bundle.outputs[0]!.text();
    mf = new Miniflare({ modules: true, script });

    const session = await mf.dispatchFetch(`${BASE}/v1/sessions/${FIXTURE_SESSION_ID}`);
    expect(session.status).toBe(200);
    expect(SessionGetResponseSchema.safeParse(await session.json()).success).toBe(true);

    const jwks = await mf.dispatchFetch(`${BASE}/v1/.well-known/jwks.json?kid=${FIXTURE_KID}`);
    expect(jwks.status).toBe(200);
    expect(DeviceJwksResponseSchema.safeParse(await jwks.json()).success).toBe(true);
  });
});
