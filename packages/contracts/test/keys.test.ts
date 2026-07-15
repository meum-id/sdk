import { describe, expect, test } from 'bun:test';
import {
  KeyRevokeRequestSchema,
  REVOKE_PURPOSES,
  type RevokeProofPayload,
  RevokeProofPayloadSchema,
  RevokePurposeSchema,
} from '../src/index';

const proofJws = 'eyJhbGciOiJFUzI1NiJ9.eyJraWQiOiJraWRfYWJjMTIzIn0.c2ln';

const proofPayload = {
  kid: 'kid_abc123',
  iat: 1751800000,
  jti: '3b46ef7d-4f6a-4c8e-9d6e-6b1a2c3d4e5f',
  purpose: 'revoke',
} as const;

describe('revoke proof payload', () => {
  test('well-formed payload parses and round-trips', () => {
    const typed: RevokeProofPayload = proofPayload;
    expect(RevokeProofPayloadSchema.parse(typed)).toEqual(proofPayload);
  });

  test('both purposes validate', () => {
    for (const purpose of REVOKE_PURPOSES) {
      expect(RevokeProofPayloadSchema.safeParse({ ...proofPayload, purpose }).success).toBe(true);
    }
  });

  test('unknown purpose rejects', () => {
    expect(RevokeProofPayloadSchema.safeParse({ ...proofPayload, purpose: 'compromised' }).success).toBe(false);
    expect(RevokePurposeSchema.safeParse('user_requested').success).toBe(false);
  });

  test.each(['kid', 'iat', 'jti', 'purpose'] as const)('missing %s rejects', (claim) => {
    const { [claim]: _omitted, ...rest } = proofPayload;
    expect(RevokeProofPayloadSchema.safeParse(rest).success).toBe(false);
  });

  test('non-integer iat rejects', () => {
    expect(RevokeProofPayloadSchema.safeParse({ ...proofPayload, iat: 1751800000.5 }).success).toBe(false);
  });

  test('short jti rejects', () => {
    expect(RevokeProofPayloadSchema.safeParse({ ...proofPayload, jti: 'short' }).success).toBe(false);
  });

  test('frozen purpose set is intact', () => {
    expect(REVOKE_PURPOSES).toEqual(['revoke', 'migration_to_full_app']);
  });
});

describe('key revoke request', () => {
  test('reason plus proof parses', () => {
    expect(KeyRevokeRequestSchema.safeParse({ reason: 'user_requested', proof: proofJws }).success).toBe(true);
  });

  test('missing proof rejects', () => {
    expect(KeyRevokeRequestSchema.safeParse({ reason: 'user_requested' }).success).toBe(false);
  });

  test('missing reason rejects', () => {
    expect(KeyRevokeRequestSchema.safeParse({ proof: proofJws }).success).toBe(false);
  });

  test('empty-string proof rejects', () => {
    expect(KeyRevokeRequestSchema.safeParse({ reason: 'user_requested', proof: '' }).success).toBe(false);
  });

  test('non-JWS proof rejects', () => {
    expect(KeyRevokeRequestSchema.safeParse({ reason: 'user_requested', proof: 'not a jws' }).success).toBe(false);
  });
});
