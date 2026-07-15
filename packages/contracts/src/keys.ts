import { z } from 'zod';
import { DeviceJwkSchema } from './jwks';
import { CompactJwtSchema, IsoDateTimeSchema, KidSchema } from './primitives';

export const DEVICE_TYPES = ['app_clip', 'full_app'] as const;
export const DeviceTypeSchema = z.enum(DEVICE_TYPES);
export type DeviceType = z.infer<typeof DeviceTypeSchema>;

export const REVOCATION_REASONS = ['migration_to_full_app', 'compromised', 'user_requested'] as const;
export const RevocationReasonSchema = z.enum(REVOCATION_REASONS);
export type RevocationReason = z.infer<typeof RevocationReasonSchema>;

/** `kyc_attestation` freshness bound enforced by the backend. */
export const KYC_ATTESTATION_MAX_AGE_DAYS = 7;

export const AppAttestSchema = z.object({
  attestation: z.string().min(1),
  challenge: z.string().min(1),
  key_id: z.string().min(1),
});
export type AppAttest = z.infer<typeof AppAttestSchema>;

export const KeysRegisterRequestSchema = z.object({
  public_key: DeviceJwkSchema,
  kyc_attestation: CompactJwtSchema,
  app_attest: AppAttestSchema.optional(),
  device_type: DeviceTypeSchema,
});
export type KeysRegisterRequest = z.infer<typeof KeysRegisterRequestSchema>;

export const KeysRegisterResponseSchema = z.object({
  kid: KidSchema,
  status: z.literal('active'),
  registered_at: IsoDateTimeSchema,
});
export type KeysRegisterResponse = z.infer<typeof KeysRegisterResponseSchema>;

export const REVOKE_PURPOSES = ['revoke', 'migration_to_full_app'] as const;
export const RevokePurposeSchema = z.enum(REVOKE_PURPOSES);
export type RevokePurpose = z.infer<typeof RevokePurposeSchema>;

/**
 * Claims of the compact-JWS revoke proof, signed by the device key being revoked. `kid` must match
 * both the revoke URL path and the JWS header `kid`; `iat` and `jti` support the backend's
 * anti-replay policy; `purpose` distinguishes a live self-revoke from a pre-signed migration token.
 */
export const RevokeProofPayloadSchema = z.object({
  kid: KidSchema,
  iat: z.number().int(),
  jti: z.string().min(16),
  purpose: RevokePurposeSchema,
});
export type RevokeProofPayload = z.infer<typeof RevokeProofPayloadSchema>;

export const KeyRevokeRequestSchema = z.object({
  reason: RevocationReasonSchema,
  /** Device proof-of-possession: a compact JWS over `RevokeProofPayload`, verified by the backend. */
  proof: CompactJwtSchema,
});
export type KeyRevokeRequest = z.infer<typeof KeyRevokeRequestSchema>;

export const KeyRevokeResponseSchema = z.object({
  kid: KidSchema,
  status: z.literal('revoked'),
  revoked_at: IsoDateTimeSchema,
});
export type KeyRevokeResponse = z.infer<typeof KeyRevokeResponseSchema>;
