/**
 * Mock Worker: every Meum endpoint served from deterministic fixtures, so the
 * device and RP tracks develop with no live backend. Workers-shaped
 * (`export default { fetch }`, runs under Miniflare) and directly runnable:
 * `bun packages/verify/src/mock-worker.ts`.
 */
import {
  FIXTURE_CREATED_AT,
  FIXTURE_EXPIRED_SESSION_ID,
  FIXTURE_EXPIRES_AT,
  FIXTURE_KID,
  FIXTURE_NONCE,
  FIXTURE_PENDING_DEVICE_ID,
  FIXTURE_REGISTERED_AT,
  FIXTURE_RETURN_URL,
  FIXTURE_REVOKED_KID,
  FIXTURE_RP_ID,
  FIXTURE_RP_NAME,
  FIXTURE_SESSION_ID,
  FIXTURE_SESSION_URL,
  FIXTURE_TIMESTAMP,
  FIXTURE_VERIFICATION_URL,
} from './fixtures/constants';
import { DEVICE_JWKS } from './fixtures/device-jwks';
import { ISSUER_JWKS } from './fixtures/issuer-jwks';
import { SEALED_CREDENTIAL } from './fixtures/sealed-credential';

interface ErrorBody {
  code: number;
  message: string;
  category: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function errorResponse(status: number, { code, message, category, retryable = false, details }: ErrorBody): Response {
  return json(status, {
    error: { code, message, category, retryable, timestamp: FIXTURE_TIMESTAMP, ...(details ? { details } : {}) },
  });
}

function handleSessionsCreate(request: Request): Response {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer mm_')) {
    return errorResponse(401, { code: 1001, message: 'Invalid API key', category: 'auth' });
  }
  return json(200, {
    session_id: FIXTURE_SESSION_ID,
    verification_url: FIXTURE_VERIFICATION_URL,
    nonce: FIXTURE_NONCE,
    expires_at: FIXTURE_EXPIRES_AT,
  });
}

function handleSessionGet(sessionId: string): Response {
  if (sessionId === FIXTURE_SESSION_ID) {
    return json(200, {
      session_id: FIXTURE_SESSION_ID,
      rp_name: FIXTURE_RP_NAME,
      rp_id: FIXTURE_RP_ID,
      predicate: 'age_over_18',
      return_url: FIXTURE_RETURN_URL,
      nonce: FIXTURE_NONCE,
      created_at: FIXTURE_CREATED_AT,
      expires_at: FIXTURE_EXPIRES_AT,
    });
  }
  if (sessionId === FIXTURE_EXPIRED_SESSION_ID) {
    return errorResponse(410, {
      code: 2002,
      message: 'Session past expiration time',
      category: 'session',
      details: { session_id: sessionId },
    });
  }
  return errorResponse(404, { code: 2001, message: 'Session not found', category: 'session' });
}

function handleKeysRegister(): Response {
  return json(
    201,
    { kid: FIXTURE_KID, status: 'active', registered_at: FIXTURE_REGISTERED_AT },
    { location: `/v1/keys/${FIXTURE_KID}` },
  );
}

function handleKeyRevoke(kid: string): Response {
  if (kid === FIXTURE_KID) {
    return json(200, { kid: FIXTURE_KID, status: 'revoked', revoked_at: FIXTURE_TIMESTAMP });
  }
  if (kid === FIXTURE_REVOKED_KID) {
    return errorResponse(409, { code: 3004, message: 'Key already revoked', category: 'key' });
  }
  return errorResponse(404, { code: 3003, message: 'Key not found', category: 'key' });
}

function handleDeviceJwks(url: URL): Response {
  const kid = url.searchParams.get('kid');
  if (kid === FIXTURE_KID) {
    return json(200, DEVICE_JWKS);
  }
  return errorResponse(404, { code: 3003, message: 'Key not found', category: 'key' });
}

function handleEnrollmentPoll(deviceId: string): Response {
  if (deviceId === FIXTURE_PENDING_DEVICE_ID) {
    return json(202, { status: 'pending' });
  }
  if (deviceId === 'device_fixture_001') {
    return json(200, { sealed_credential: SEALED_CREDENTIAL });
  }
  return errorResponse(410, { code: 2002, message: 'Enrollment expired', category: 'session' });
}

// This dispatch table is a hand-maintained offline-fixture mirror of
// meum-id/api's real routes, which are the source of truth. The mirror exists
// so the device and RP tracks develop with no live backend; drift is expected
// and the table is updated when meum-id/api's routes change.
export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();

  if (method === 'POST' && pathname === '/v1/sessions/create') {
    return handleSessionsCreate(request);
  }
  const sessionMatch = pathname.match(/^\/v1\/sessions\/([^/]+)$/);
  if (method === 'GET' && sessionMatch?.[1]) {
    return handleSessionGet(sessionMatch[1]);
  }
  if (method === 'POST' && pathname === '/v1/keys/register') {
    return handleKeysRegister();
  }
  const revokeMatch = pathname.match(/^\/v1\/keys\/([^/]+)\/revoke$/);
  if (method === 'POST' && revokeMatch?.[1]) {
    return handleKeyRevoke(revokeMatch[1]);
  }
  if (method === 'POST' && pathname === '/v1/events/usage') {
    return json(200, { recorded: true });
  }
  if (method === 'GET' && pathname === '/v1/.well-known/jwks.json') {
    return handleDeviceJwks(url);
  }
  if (method === 'GET' && pathname === '/v1/.well-known/issuer-jwks.json') {
    return json(200, ISSUER_JWKS);
  }
  if (method === 'POST' && pathname === '/v1/webhooks/veriff') {
    return json(200, { received: true });
  }
  if (method === 'POST' && pathname === '/v1/enrollment/init') {
    return json(202, { session_url: FIXTURE_SESSION_URL });
  }
  const enrollmentMatch = pathname.match(/^\/v1\/enrollment\/([^/]+)$/);
  if (method === 'GET' && enrollmentMatch?.[1] && enrollmentMatch[1] !== 'init') {
    return handleEnrollmentPoll(enrollmentMatch[1]);
  }

  return errorResponse(404, { code: 7003, message: 'Unknown route', category: 'validation' });
}

const mockWorker = {
  fetch: (request: Request): Promise<Response> => handleRequest(request),
};

export default mockWorker;

interface BunRuntime {
  serve: (options: { port: number; fetch: (request: Request) => Promise<Response> }) => { url: URL };
}

const bunRuntime = (globalThis as { Bun?: BunRuntime }).Bun;
const isMain = (import.meta as { main?: boolean }).main === true;

if (bunRuntime && isMain) {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const port = Number(env?.PORT ?? 8788);
  const server = bunRuntime.serve({ port, fetch: mockWorker.fetch });
  console.log(`meum mock worker listening on ${server.url}`);
}
