import { z } from 'zod';
import { DeviceTypeSchema } from './keys';
import { IsoDateTimeSchema, SessionIdSchema, Sha256HexSchema } from './primitives';

/** Deliberately generic outcomes; no "why" inference. */
export const USAGE_RESULTS = [
  'success',
  'requirement_not_met',
  'user_cancelled',
  'expired_session',
  'network_error',
] as const;
export const UsageResultSchema = z.enum(USAGE_RESULTS);
export type UsageResult = z.infer<typeof UsageResultSchema>;

export const UsageEventRequestSchema = z.object({
  session_id: SessionIdSchema,
  receipt_hash: Sha256HexSchema,
  result: UsageResultSchema,
  timestamp: IsoDateTimeSchema,
  app_type: DeviceTypeSchema,
  app_version: z.string().min(1),
  identity_verification: z.object({
    method: z.string().min(1),
    vendor: z.string().min(1),
  }),
});
export type UsageEventRequest = z.infer<typeof UsageEventRequestSchema>;

export const UsageEventResponseSchema = z.object({
  recorded: z.boolean(),
});
export type UsageEventResponse = z.infer<typeof UsageEventResponseSchema>;
