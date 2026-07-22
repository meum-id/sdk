import { describe, expect, test } from 'bun:test';
import type { EnvelopeV2, ReceiptCallbackV2, ReceiptPayloadV2 } from '../src/receipt-types';
import {
  HPKE_SUITE,
  HPKE_SUITE_ID,
  RECEIPT_ENVELOPE_AAD_SEPARATOR,
  RECEIPT_ENVELOPE_INFO,
  RECEIPT_ENVELOPE_VERSION,
  receiptEnvelopeAad,
} from '../src/receipt-types';

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// Field lists frozen to the same literals asserted in @meum/contracts
// test/schemas.test.ts; drift on either side of the hand-mirror trips one of
// the two suites.
const ENVELOPE_V2_FIELDS = ['v', 'suite', 'kid', 'enc', 'ct'] as const;
const CALLBACK_V2_FIELDS = ['session_id', 'nonce', 'receipt'] as const;
const PAYLOAD_V2_FIELDS = [
  'iss',
  'aud',
  'session_id',
  'nonce',
  'iat',
  'exp',
  'predicate_result',
  'analytics_allowed',
  'rp_key_thumbprint',
] as const;

const envelopeKeysMatch: Equal<keyof EnvelopeV2, (typeof ENVELOPE_V2_FIELDS)[number]> = true;
const callbackKeysMatch: Equal<keyof ReceiptCallbackV2, (typeof CALLBACK_V2_FIELDS)[number]> = true;
const payloadKeysMatch: Equal<keyof ReceiptPayloadV2, (typeof PAYLOAD_V2_FIELDS)[number]> = true;

const sampleEnvelope: EnvelopeV2 = {
  v: RECEIPT_ENVELOPE_VERSION,
  suite: HPKE_SUITE_ID,
  kid: 'rp-key-2026-07',
  enc: 'B'.repeat(87),
  ct: 'C'.repeat(22),
};

describe('receipt-types mirror parity', () => {
  test('v2 field sets match the @meum/contracts schemas', () => {
    expect(envelopeKeysMatch).toBe(true);
    expect(callbackKeysMatch).toBe(true);
    expect(payloadKeysMatch).toBe(true);
    expect(Object.keys(sampleEnvelope).sort()).toEqual(['ct', 'enc', 'kid', 'suite', 'v']);
  });

  test('ciphersuite id triple is intact (RFC 9180 registry values)', () => {
    expect(HPKE_SUITE).toEqual({ kem: 0x0010, kdf: 0x0001, aead: 0x0002 });
    expect(Object.isFrozen(HPKE_SUITE)).toBe(true);
  });

  test('suite wire id and envelope version are byte-frozen', () => {
    expect(HPKE_SUITE_ID).toBe('HPKE-P256-SHA256-A256GCM');
    expect(RECEIPT_ENVELOPE_VERSION).toBe(2);
  });

  test('info binds at HPKE context creation with frozen bytes (raw UTF-8, no length prefix)', () => {
    expect(RECEIPT_ENVELOPE_INFO).toBe('meum:sealed-receipt:v2');
    expect([...new TextEncoder().encode(RECEIPT_ENVELOPE_INFO)]).toEqual([
      0x6d, 0x65, 0x75, 0x6d, 0x3a, 0x73, 0x65, 0x61, 0x6c, 0x65, 0x64, 0x2d, 0x72, 0x65, 0x63, 0x65, 0x69, 0x70, 0x74,
      0x3a, 0x76, 0x32,
    ]);
  });

  test('per-message aad is session_id ‖ 0x7c ‖ nonce (raw UTF-8, no length prefixes)', () => {
    expect(RECEIPT_ENVELOPE_AAD_SEPARATOR).toBe('|');
    const aad = receiptEnvelopeAad('sess_ab', 'n-1');
    expect(aad).toBe('sess_ab|n-1');
    expect([...new TextEncoder().encode(aad)]).toEqual([
      0x73, 0x65, 0x73, 0x73, 0x5f, 0x61, 0x62, 0x7c, 0x6e, 0x2d, 0x31,
    ]);
  });
});
