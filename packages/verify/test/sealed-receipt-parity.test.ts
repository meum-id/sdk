import { describe, expect, test } from 'bun:test';
import {
  DEVICE_JWKS,
  FIXTURE_IAT,
  FIXTURE_NONCE,
  FIXTURE_NOW,
  FIXTURE_RP_ID,
  FIXTURE_SESSION_ID,
  SEALED_RECEIPT_PARITY,
} from '../src/fixtures/index';
import type { SealedParityCase } from '../src/fixtures/sealed-receipt-parity-types';
import { computeJwkThumbprint, openFromEnvelope } from '../src/hpke';
import {
  HPKE_SUITE_ID,
  RECEIPT_ENVELOPE_AAD_SEPARATOR,
  RECEIPT_ENVELOPE_INFO,
  RECEIPT_ENVELOPE_VERSION,
  receiptEnvelopeAad,
} from '../src/receipt-types';
import { verify } from '../src/verify';

const { meta, device_jwk, recipients, cases } = SEALED_RECEIPT_PARITY;

const baseOptions = {
  jwks: DEVICE_JWKS,
  expectedAudience: meta.audience,
  expectedNonce: meta.nonce,
  expectedSessionId: meta.session_id,
  now: FIXTURE_NOW,
};

function parityCase(name: string): SealedParityCase {
  const found = cases.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`parity matrix has no case named ${name}`);
  }
  return found;
}

/** kid → private key selection, as an RP keyring holding a retained rotated-out key does. */
function recipientByKid(kid: string) {
  const match = [recipients.current, recipients.superseded].find((recipient) => recipient.kid === kid);
  if (!match) {
    throw new Error(`parity matrix has no recipient key for kid ${kid}`);
  }
  return match;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// The CryptoKit sealer restates the frozen constants as Swift literals; the
// emitted metadata carries those literals, so any drift from this package's
// constants (themselves pinned to the frozen bytes in receipt-types.test.ts)
// fails here.
describe('sealed-receipt parity: drift guard', () => {
  test('envelope bindings match the frozen constants byte-for-byte', () => {
    expect(meta.v).toBe(RECEIPT_ENVELOPE_VERSION);
    expect(meta.suite).toBe(HPKE_SUITE_ID);
    expect(meta.info).toBe(RECEIPT_ENVELOPE_INFO);
    expect(meta.aad_separator).toBe(RECEIPT_ENVELOPE_AAD_SEPARATOR);
    expect(meta.aad_utf8).toBe(receiptEnvelopeAad(meta.session_id, meta.nonce));
  });

  test('every emitted envelope carries the frozen version and suite id', () => {
    for (const candidate of cases) {
      expect(candidate.callback.receipt.v).toBe(RECEIPT_ENVELOPE_VERSION);
      expect(candidate.callback.receipt.suite).toBe(HPKE_SUITE_ID);
    }
  });

  test('routing ids and clock match the shared fixture constants', () => {
    expect(meta.session_id).toBe(FIXTURE_SESSION_ID);
    expect(meta.nonce).toBe(FIXTURE_NONCE);
    expect(meta.audience).toBe(FIXTURE_RP_ID);
    expect(meta.iat).toBe(FIXTURE_IAT);
  });

  test('the emitting device key is the committed DEVICE_JWKS key', () => {
    const [committed] = DEVICE_JWKS.keys;
    expect(device_jwk.x).toBe(committed?.x as string);
    expect(device_jwk.y).toBe(committed?.y as string);
    expect(device_jwk.kid).toBe(committed?.kid as string);
  });

  test('RFC 7638 thumbprints agree cross-stack for both recipient keys', async () => {
    expect(await computeJwkThumbprint(recipients.current.jwk)).toBe(recipients.current.thumbprint);
    expect(await computeJwkThumbprint(recipients.superseded.jwk)).toBe(recipients.superseded.thumbprint);
  });

  test('the matrix covers exactly the frozen case set', () => {
    expect(cases.map((candidate) => candidate.name).sort()).toEqual([
      'superseded_key',
      'swapped_nonce',
      'swapped_session_id',
      'valid',
      'wrong_recipient_key',
    ]);
  });
});

describe('sealed-receipt parity: case matrix', () => {
  test('valid: the CryptoKit envelope opens byte-exact under @hpke/core', async () => {
    const { callback, inner_receipt } = parityCase('valid');
    const plaintext = await openFromEnvelope(
      recipients.current.jwk,
      callback.receipt,
      RECEIPT_ENVELOPE_INFO,
      receiptEnvelopeAad(callback.session_id, callback.nonce),
    );
    expect(plaintext).toBe(inner_receipt);
  });

  test('valid: the opened receipt verifies with outer ids and thumbprint re-asserted', async () => {
    const { callback } = parityCase('valid');
    const result = await verify(callback, { ...baseOptions, recipientKey: recipients.current.jwk });
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.predicate_result).toBe(true);
    expect(result.payload?.session_id).toBe(callback.session_id);
    expect(result.payload?.nonce).toBe(callback.nonce);
    expect((result.payload as { rp_key_thumbprint?: string })?.rp_key_thumbprint).toBe(recipients.current.thumbprint);
  });

  test('valid: canonical envelope JSON and receipt hash re-derive byte-identically', async () => {
    for (const candidate of cases) {
      const { receipt } = candidate.callback;
      const canonical = JSON.stringify({
        ct: receipt.ct,
        enc: receipt.enc,
        kid: receipt.kid,
        suite: receipt.suite,
        v: receipt.v,
      });
      expect(canonical).toBe(candidate.canonical_envelope_json);
      expect(await sha256Hex(canonical)).toBe(candidate.receipt_hash);
    }
  });

  test('wrong_recipient_key -> open_failed', async () => {
    const { callback, expect: expected } = parityCase('wrong_recipient_key');
    expect(expected).toBe('open_failed');
    const result = await verify(callback, { ...baseOptions, recipientKey: recipients.current.jwk });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('open_failed');
  });

  test('swapped_session_id -> open_failed', async () => {
    const { callback, expect: expected } = parityCase('swapped_session_id');
    expect(expected).toBe('open_failed');
    expect(callback.session_id).not.toBe(meta.session_id);
    const result = await verify(callback, { ...baseOptions, recipientKey: recipients.current.jwk });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('open_failed');
  });

  test('swapped_nonce -> open_failed', async () => {
    const { callback, expect: expected } = parityCase('swapped_nonce');
    expect(expected).toBe('open_failed');
    expect(callback.nonce).not.toBe(meta.nonce);
    const result = await verify(callback, { ...baseOptions, recipientKey: recipients.current.jwk });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('open_failed');
  });

  test('superseded_key: opens and verifies with the retained key selected by kid', async () => {
    const { callback, inner_receipt } = parityCase('superseded_key');
    const retained = recipientByKid(callback.receipt.kid);
    expect(retained.kid).toBe(recipients.superseded.kid);
    const plaintext = await openFromEnvelope(
      retained.jwk,
      callback.receipt,
      RECEIPT_ENVELOPE_INFO,
      receiptEnvelopeAad(callback.session_id, callback.nonce),
    );
    expect(plaintext).toBe(inner_receipt);
    const result = await verify(callback, { ...baseOptions, recipientKey: retained.jwk });
    expect(result.valid).toBe(true);
    expect((result.payload as { rp_key_thumbprint?: string })?.rp_key_thumbprint).toBe(retained.thumbprint);
  });

  test('superseded_key: the current key cannot open it (kid selection is load-bearing)', async () => {
    const { callback } = parityCase('superseded_key');
    const result = await verify(callback, { ...baseOptions, recipientKey: recipients.current.jwk });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('open_failed');
  });
});
