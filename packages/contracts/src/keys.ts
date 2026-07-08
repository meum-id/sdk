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

export const KeyRevokeRequestSchema = z.object({
  reason: RevocationReasonSchema,
});
export type KeyRevokeRequest = z.infer<typeof KeyRevokeRequestSchema>;

export const KeyRevokeResponseSchema = z.object({
  kid: KidSchema,
  status: z.literal('revoked'),
  revoked_at: IsoDateTimeSchema,
});
export type KeyRevokeResponse = z.infer<typeof KeyRevokeResponseSchema>;
