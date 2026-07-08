import { z } from 'zod';
import { Base64Url32ByteSchema, IsoDateTimeSchema, KidSchema } from './primitives';

/** Device Secure-Enclave signing key (ES256). */
export const DeviceJwkSchema = z.object({
  kty: z.literal('EC'),
  crv: z.literal('P-256'),
  x: Base64Url32ByteSchema,
  y: Base64Url32ByteSchema,
  kid: KidSchema,
  alg: z.literal('ES256'),
  use: z.literal('sig'),
});
export type DeviceJwk = z.infer<typeof DeviceJwkSchema>;

export const KEY_STATUSES = ['active', 'revoked'] as const;
export const KeyStatusSchema = z.enum(KEY_STATUSES);
export type KeyStatus = z.infer<typeof KeyStatusSchema>;

export const DeviceJwksEntrySchema = DeviceJwkSchema.extend({
  status: KeyStatusSchema,
  registered_at: IsoDateTimeSchema,
});
export type DeviceJwksEntry = z.infer<typeof DeviceJwksEntrySchema>;

/** Query-by-kid device JWKS response: exactly one key (no bulk listing). */
export const DeviceJwksResponseSchema = z.object({
  keys: z.array(DeviceJwksEntrySchema).length(1),
});
export type DeviceJwksResponse = z.infer<typeof DeviceJwksResponseSchema>;

/** Meum issuer key (the device verifies the enrollment credential against it). */
export const IssuerJwkSchema = z.object({
  kty: z.literal('EC'),
  crv: z.literal('P-256'),
  x: Base64Url32ByteSchema,
  y: Base64Url32ByteSchema,
  kid: z.string().min(1),
  alg: z.literal('ES256'),
  use: z.literal('sig'),
});
export type IssuerJwk = z.infer<typeof IssuerJwkSchema>;

export const IssuerJwksResponseSchema = z.object({
  keys: z.array(IssuerJwkSchema).min(1),
});
export type IssuerJwksResponse = z.infer<typeof IssuerJwksResponseSchema>;

/** Device ephemeral encryption key posted on enrollment init. */
export const X25519JwkSchema = z.object({
  kty: z.literal('OKP'),
  crv: z.literal('X25519'),
  x: Base64Url32ByteSchema,
});
export type X25519Jwk = z.infer<typeof X25519JwkSchema>;
