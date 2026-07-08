import { describe, expect, test } from 'bun:test';
import { toCamelCase, toSnakeCase } from '../src/transform';

describe('toSnakeCase', () => {
  test('transforms keys deeply', () => {
    expect(
      toSnakeCase<Record<string, unknown>>({
        returnUrl: 'https://rp.example.com/cb',
        identityVerification: { appVersion: '1.0.0' },
      }),
    ).toEqual({
      return_url: 'https://rp.example.com/cb',
      identity_verification: { app_version: '1.0.0' },
    });
  });

  test('maps allOf to all_of and leaves claim values alone', () => {
    expect(toSnakeCase<Record<string, unknown>>({ predicate: { allOf: ['age_over_18', 'locale_US_CA'] } })).toEqual({
      predicate: { all_of: ['age_over_18', 'locale_US_CA'] },
    });
  });

  test('leaves the metadata subtree opaque', () => {
    expect(toSnakeCase<Record<string, unknown>>({ metadata: { userAgent: 'x', someKey: 1 } })).toEqual({
      metadata: { userAgent: 'x', someKey: 1 },
    });
  });

  test('handles arrays and primitives', () => {
    expect(toSnakeCase<unknown[]>([{ aB: 1 }, 'aB', 2])).toEqual([{ a_b: 1 }, 'aB', 2]);
    expect(toSnakeCase<string>('plainString')).toBe('plainString');
    expect(toSnakeCase(null)).toBeNull();
  });
});

describe('toCamelCase', () => {
  test('transforms keys deeply', () => {
    expect(
      toCamelCase<Record<string, unknown>>({
        session_id: 'sess_abc123',
        verification_url: 'https://verify.meum.id/session?id=sess_abc123',
        expires_at: '2026-07-06T12:05:00Z',
      }),
    ).toEqual({
      sessionId: 'sess_abc123',
      verificationUrl: 'https://verify.meum.id/session?id=sess_abc123',
      expiresAt: '2026-07-06T12:05:00Z',
    });
  });

  test('leaves the details subtree opaque', () => {
    expect(toCamelCase<Record<string, unknown>>({ error_code: 1, details: { session_id: 'sess_x' } })).toEqual({
      errorCode: 1,
      details: { session_id: 'sess_x' },
    });
  });

  test('round-trips with toSnakeCase', () => {
    const camel = { sessionId: 'sess_x', identityVerification: { appVersion: '1' } };
    expect(toCamelCase<Record<string, unknown>>(toSnakeCase(camel))).toEqual(camel);
  });
});
