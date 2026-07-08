import { z } from 'zod';
import { X25519JwkSchema } from './jwks';
import { Base64Url24ByteSchema, Base64UrlSchema, HttpsUrlSchema, SessionIdSchema } from './primitives';

/** HKDF-SHA256 info string for the sealed-credential key derivation. */
export const HKDF_INFO = 'meum-enrollment-v1';

/** Sealed credential KV TTL; single-use, deleted on read. */
export const ENROLLMENT_TTL_SECONDS = 300;

/** Enrollment credential validity: one year. */
export const CREDENTIAL_TTL_SECONDS = 31_536_000;

export const EnrollmentInitRequestSchema = z.object({
  device_id: z.string().min(1),
  public_encryption_key: X25519JwkSchema,
  session_id: SessionIdSchema,
});
export type EnrollmentInitRequest = z.infer<typeof EnrollmentInitRequestSchema>;

export const EnrollmentInitResponseSchema = z.object({
  session_url: HttpsUrlSchema,
});
export type EnrollmentInitResponse = z.infer<typeof EnrollmentInitResponseSchema>;

/**
 * ECIES-style envelope: `epk` is the backend sender-ephemeral X25519 JWK; the
 * key is HKDF-SHA256 over ECDH(epk, device key) with info `meum-enrollment-v1`;
 * the cipher is XChaCha20-Poly1305 with a 24-byte nonce.
 */
export const SealedCredentialEnvelopeSchema = z.object({
  epk: X25519JwkSchema,
  nonce: Base64Url24ByteSchema,
  ciphertext: Base64UrlSchema.min(1),
});
export type SealedCredentialEnvelope = z.infer<typeof SealedCredentialEnvelopeSchema>;

export const EnrollmentPollResponseSchema = z.object({
  sealed_credential: SealedCredentialEnvelopeSchema,
});
export type EnrollmentPollResponse = z.infer<typeof EnrollmentPollResponseSchema>;

export const SEXES = ['M', 'F', 'X'] as const;
export const SexSchema = z.enum(SEXES);
export type Sex = z.infer<typeof SexSchema>;

/**
 * Plaintext of the sealed credential JWT (issuer-signed, ES256). `locale` is
 * ISO-3166-2 (`US`, `US-CA`).
 */
export const CredentialPayloadSchema = z.object({
  date_of_birth: z.iso.date(),
  sex: SexSchema,
  locale: z.string().regex(/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/, 'expected an ISO-3166-2 code'),
  kyc_iat: z.number().int(),
  exp: z.number().int(),
});
export type CredentialPayload = z.infer<typeof CredentialPayloadSchema>;
