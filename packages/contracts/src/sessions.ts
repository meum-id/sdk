import { z } from 'zod';
import { PredicateSchema } from './predicate';
import { HttpsUrlSchema, IsoDateTimeSchema, NonceSchema, RpIdSchema, SessionIdSchema } from './primitives';

/** Session TTL is a hard five minutes. */
export const SESSION_TTL_SECONDS = 300;

export const SessionCreateRequestSchema = z.object({
  predicate: PredicateSchema,
  return_url: HttpsUrlSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SessionCreateRequest = z.infer<typeof SessionCreateRequestSchema>;

export const SessionCreateResponseSchema = z.object({
  session_id: SessionIdSchema,
  verification_url: HttpsUrlSchema,
  nonce: NonceSchema,
  expires_at: IsoDateTimeSchema,
});
export type SessionCreateResponse = z.infer<typeof SessionCreateResponseSchema>;

export const SessionGetResponseSchema = z.object({
  session_id: SessionIdSchema,
  rp_name: z.string().min(1),
  rp_id: RpIdSchema,
  predicate: PredicateSchema,
  return_url: HttpsUrlSchema,
  nonce: NonceSchema,
  created_at: IsoDateTimeSchema,
  expires_at: IsoDateTimeSchema,
});
export type SessionGetResponse = z.infer<typeof SessionGetResponseSchema>;
