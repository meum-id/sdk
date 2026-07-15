import { describe, expect, test } from 'bun:test';
import {
  DeviceJwksResponseSchema,
  EnrollmentInitRequestSchema,
  EnrollmentInitResponseSchema,
  EnrollmentPollResponseSchema,
  ERROR_CODES,
  ErrorEnvelopeSchema,
  errorCategoryForCode,
  ID_PREFIXES,
  IssuerJwksResponseSchema,
  KeyRevokeRequestSchema,
  KeyRevokeResponseSchema,
  KeysRegisterRequestSchema,
  KeysRegisterResponseSchema,
  ReceiptCallbackSchema,
  ReceiptHeaderSchema,
  ReceiptPayloadSchema,
  SessionCreateRequestSchema,
  SessionCreateResponseSchema,
  SessionGetResponseSchema,
  UsageEventRequestSchema,
  UsageEventResponseSchema,
  validationErrorCode,
} from '../src/index';

const X = 'A'.repeat(43);
const Y = 'B'.repeat(43);

const deviceJwk = {
  kty: 'EC',
  crv: 'P-256',
  x: X,
  y: Y,
  kid: 'kid_abc123',
  alg: 'ES256',
  use: 'sig',
} as const;

const fixtures: Array<[string, { safeParse: (v: unknown) => { success: boolean } }, unknown]> = [
  [
    'SessionCreateRequest',
    SessionCreateRequestSchema,
    {
      predicate: 'age_over_18',
      return_url: 'https://rp.example.com/verify/callback',
      metadata: { ip: '1.2.3.4', user_agent: 'test' },
    },
  ],
  [
    'SessionCreateResponse',
    SessionCreateResponseSchema,
    {
      session_id: 'sess_abc123',
      verification_url: 'https://verify.meum.id/session?id=sess_abc123',
      nonce: '3b46ef7d-4f6a-4c8e-9d6e-6b1a2c3d4e5f',
      expires_at: '2026-07-06T12:05:00Z',
    },
  ],
  [
    'SessionGetResponse',
    SessionGetResponseSchema,
    {
      session_id: 'sess_abc123',
      rp_name: 'Example Delivery',
      rp_id: 'rp_example_123',
      predicate: { all_of: ['age_over_18', 'locale_US_CA'] },
      return_url: 'https://rp.example.com/verify/callback',
      nonce: '3b46ef7d-4f6a-4c8e-9d6e-6b1a2c3d4e5f',
      created_at: '2026-07-06T12:00:00Z',
      expires_at: '2026-07-06T12:05:00Z',
    },
  ],
  [
    'KeysRegisterRequest',
    KeysRegisterRequestSchema,
    {
      public_key: deviceJwk,
      kyc_attestation: 'eyJhbGciOiJFUzI1NiJ9.eyJreWNfaWF0IjoxfQ.c2ln',
      app_attest: { attestation: 'att', challenge: 'chal', key_id: 'key1' },
      device_type: 'app_clip',
    },
  ],
  [
    'KeysRegisterResponse',
    KeysRegisterResponseSchema,
    { kid: 'kid_abc123', status: 'active', registered_at: '2026-07-06T12:00:00Z' },
  ],
  [
    'KeyRevokeRequest',
    KeyRevokeRequestSchema,
    { reason: 'migration_to_full_app', proof: 'eyJhbGciOiJFUzI1NiJ9.eyJraWQiOiJraWRfYWJjMTIzIn0.c2ln' },
  ],
  [
    'KeyRevokeResponse',
    KeyRevokeResponseSchema,
    { kid: 'kid_abc123', status: 'revoked', revoked_at: '2026-07-06T12:00:00Z' },
  ],
  [
    'UsageEventRequest',
    UsageEventRequestSchema,
    {
      session_id: 'sess_abc123',
      receipt_hash: 'a'.repeat(64),
      result: 'success',
      timestamp: '2026-07-06T12:00:00Z',
      app_type: 'app_clip',
      app_version: '1.0.0',
      identity_verification: { method: 'veriff', vendor: 'veriff' },
    },
  ],
  ['UsageEventResponse', UsageEventResponseSchema, { recorded: true }],
  [
    'DeviceJwksResponse',
    DeviceJwksResponseSchema,
    { keys: [{ ...deviceJwk, status: 'active', registered_at: '2026-07-06T12:00:00Z' }] },
  ],
  [
    'IssuerJwksResponse',
    IssuerJwksResponseSchema,
    { keys: [{ kty: 'EC', crv: 'P-256', x: X, y: Y, kid: 'meum-enrollment-2026', alg: 'ES256', use: 'sig' }] },
  ],
  [
    'EnrollmentInitRequest',
    EnrollmentInitRequestSchema,
    {
      device_id: 'device_fixture_001',
      public_encryption_key: { kty: 'OKP', crv: 'X25519', x: X },
      session_id: 'sess_abc123',
    },
  ],
  ['EnrollmentInitResponse', EnrollmentInitResponseSchema, { session_url: 'https://station.veriff.com/v/token' }],
  [
    'EnrollmentPollResponse',
    EnrollmentPollResponseSchema,
    {
      sealed_credential: {
        epk: { kty: 'OKP', crv: 'X25519', x: X },
        nonce: 'C'.repeat(32),
        ciphertext: 'D'.repeat(100),
      },
    },
  ],
  ['ReceiptHeader', ReceiptHeaderSchema, { alg: 'ES256', typ: 'JWT', kid: 'kid_abc123' }],
  [
    'ReceiptPayload',
    ReceiptPayloadSchema,
    {
      iss: 'device:kid_abc123',
      aud: 'rp_example_123',
      session_id: 'sess_abc123',
      nonce: '3b46ef7d-4f6a-4c8e-9d6e-6b1a2c3d4e5f',
      iat: 1751800000,
      exp: 1751800300,
      predicate_result: true,
      analytics_allowed: false,
    },
  ],
  ['ReceiptCallback', ReceiptCallbackSchema, { receipt: 'eyJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJycF94In0.c2ln' }],
];

describe('schema round-trips', () => {
  test.each(fixtures)('%s fixture parses', (_name, schema, fixture) => {
    const result = schema.safeParse(fixture);
    expect(result.success).toBe(true);
  });
});

describe('validation error codes', () => {
  test('missing required field maps to 7002', () => {
    const result = SessionCreateRequestSchema.safeParse({ predicate: 'age_over_18' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(validationErrorCode(result.error.issues[0]!)).toBe(ERROR_CODES.VALIDATION_MISSING_FIELD);
    }
  });

  test('invalid format maps to 7003', () => {
    const result = SessionCreateRequestSchema.safeParse({
      predicate: 'age_over_18',
      return_url: 'http://insecure.example.com/cb',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(validationErrorCode(result.error.issues[0]!)).toBe(ERROR_CODES.VALIDATION_INVALID_FORMAT);
    }
  });

  test('non-HTTPS return_url rejects', () => {
    expect(
      SessionCreateRequestSchema.safeParse({
        predicate: 'age_over_18',
        return_url: 'http://rp.example.com/cb',
      }).success,
    ).toBe(false);
  });
});

describe('error envelope', () => {
  test('envelope fixture parses', () => {
    const envelope = {
      error: {
        code: 2002,
        message: 'Session past expiration time',
        category: 'session',
        retryable: false,
        timestamp: '2026-07-06T12:05:01Z',
        details: { session_id: 'sess_abc123' },
      },
    };
    expect(ErrorEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  test('frozen code map is intact', () => {
    expect(ERROR_CODES).toEqual({
      AUTH_INVALID_API_KEY: 1001,
      AUTH_EXPIRED_API_KEY: 1002,
      SESSION_NOT_FOUND: 2001,
      SESSION_EXPIRED: 2002,
      KEY_INVALID: 3001,
      KEY_DUPLICATE: 3002,
      KEY_NOT_FOUND: 3003,
      KEY_ALREADY_REVOKED: 3004,
      RATE_LIMITED: 5001,
      VALIDATION_MISSING_FIELD: 7002,
      VALIDATION_INVALID_FORMAT: 7003,
      INTERNAL_DATABASE: 8002,
    });
  });

  test('every code maps to its category', () => {
    expect(errorCategoryForCode(1001)).toBe('auth');
    expect(errorCategoryForCode(2002)).toBe('session');
    expect(errorCategoryForCode(3004)).toBe('key');
    expect(errorCategoryForCode(5001)).toBe('rate_limit');
    expect(errorCategoryForCode(7003)).toBe('validation');
    expect(errorCategoryForCode(8002)).toBe('internal');
  });
});

describe('ID prefixes', () => {
  test('frozen prefixes are intact', () => {
    expect(ID_PREFIXES).toEqual({
      apiKey: 'mm_',
      session: 'sess_',
      deviceKey: 'kid_',
      request: 'req_',
      relyingParty: 'rp_',
    });
  });
});

describe('malformed payload rejection', () => {
  test('bad device JWK rejects (wrong curve)', () => {
    expect(
      KeysRegisterRequestSchema.safeParse({
        public_key: { ...deviceJwk, crv: 'P-384' },
        kyc_attestation: 'eyJhbGciOiJFUzI1NiJ9.eyJreWNfaWF0IjoxfQ.c2ln',
        device_type: 'full_app',
      }).success,
    ).toBe(false);
  });

  test('bad device JWK rejects (short coordinate)', () => {
    expect(
      KeysRegisterRequestSchema.safeParse({
        public_key: { ...deviceJwk, x: 'short' },
        kyc_attestation: 'eyJhbGciOiJFUzI1NiJ9.eyJreWNfaWF0IjoxfQ.c2ln',
        device_type: 'full_app',
      }).success,
    ).toBe(false);
  });

  test('unknown usage result rejects', () => {
    expect(
      UsageEventRequestSchema.safeParse({
        session_id: 'sess_abc123',
        receipt_hash: 'a'.repeat(64),
        result: 'partial_success',
        timestamp: '2026-07-06T12:00:00Z',
        app_type: 'app_clip',
        app_version: '1.0.0',
        identity_verification: { method: 'veriff', vendor: 'veriff' },
      }).success,
    ).toBe(false);
  });

  test('device JWKS with two keys rejects (query-by-kid returns exactly one)', () => {
    const entry = { ...deviceJwk, status: 'active', registered_at: '2026-07-06T12:00:00Z' };
    expect(DeviceJwksResponseSchema.safeParse({ keys: [entry, entry] }).success).toBe(false);
  });
});
