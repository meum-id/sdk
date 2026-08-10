/** Deterministic identifiers shared by the fixtures and the mock Worker. */

export const FIXTURE_KID = 'kid_fixture001';
export const FIXTURE_UNKNOWN_KID = 'kid_unknown999';
export const FIXTURE_REVOKED_KID = 'kid_revoked001';
export const FIXTURE_ISSUER_KID = 'meum-enrollment-2026';

export const FIXTURE_RP_ID = 'rp_example_123';
export const FIXTURE_WRONG_RP_ID = 'rp_wrong_456';
export const FIXTURE_RP_NAME = 'Example Delivery';

export const FIXTURE_SESSION_ID = 'sess_fixture001';
export const FIXTURE_EXPIRED_SESSION_ID = 'sess_expired001';
export const FIXTURE_NONCE = '3b46ef7d-4f6a-4c8e-9d6e-6b1a2c3d4e5f';
export const FIXTURE_WRONG_NONCE = '9d1a5f22-0c4b-4e7a-8b3c-5e6f7a8b9c0d';

export const FIXTURE_DEVICE_ID = 'device_fixture_001';
export const FIXTURE_PENDING_DEVICE_ID = 'device_pending_001';

/** Receipt timing: iat/exp from the frozen plan example; NOW sits inside the window. */
export const FIXTURE_IAT = 1751800000;
export const FIXTURE_EXP = 1751800300;
export const FIXTURE_NOW = 1751800060;

export const FIXTURE_CREATED_AT = '2026-07-06T12:00:00Z';
export const FIXTURE_EXPIRES_AT = '2026-07-06T12:05:00Z';
export const FIXTURE_REGISTERED_AT = '2026-07-06T12:00:00Z';
export const FIXTURE_TIMESTAMP = '2026-07-06T12:00:00Z';

export const FIXTURE_RETURN_URL = 'https://rp.example.com/verify/callback';
export const FIXTURE_VERIFICATION_URL = `https://verify.meum.id/session?id=${FIXTURE_SESSION_ID}`;
export const FIXTURE_SESSION_URL = 'https://station.veriff.com/v/fixture-session-token';
