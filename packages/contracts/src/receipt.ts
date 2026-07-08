import { z } from 'zod';
import { CompactJwtSchema, KidSchema, NonceSchema, RpIdSchema, SessionIdSchema } from './primitives';

export const RECEIPT_ISS_PREFIX = 'device:';

export const ReceiptHeaderSchema = z.object({
  alg: z.literal('ES256'),
  typ: z.literal('JWT'),
  kid: KidSchema,
});
export type ReceiptHeader = z.infer<typeof ReceiptHeaderSchema>;

export const ReceiptPayloadSchema = z.object({
  iss: z.string().startsWith(`${RECEIPT_ISS_PREFIX}kid_`),
  aud: RpIdSchema,
  session_id: SessionIdSchema,
  nonce: NonceSchema,
  iat: z.number().int(),
  exp: z.number().int(),
  predicate_result: z.boolean(),
  analytics_allowed: z.boolean(),
});
export type ReceiptPayload = z.infer<typeof ReceiptPayloadSchema>;

/** Device→RP receipt callback: `POST return_url` with this JSON body. */
export const ReceiptCallbackSchema = z.object({
  receipt: CompactJwtSchema,
});
export type ReceiptCallback = z.infer<typeof ReceiptCallbackSchema>;
