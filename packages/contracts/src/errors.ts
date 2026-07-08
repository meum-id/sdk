import { z } from 'zod';
import { ERROR_CATEGORIES, ERROR_CODES } from './codes';
import { IsoDateTimeSchema } from './primitives';

export const ErrorCategorySchema = z.enum(ERROR_CATEGORIES);

/**
 * Maps a Zod issue to the frozen validation code: a missing required field is
 * `7002`, any other shape problem is `7003`.
 */
export function validationErrorCode(issue: z.core.$ZodIssue): 7002 | 7003 {
  if (issue.code === 'invalid_type' && (issue as { input?: unknown }).input === undefined) {
    return ERROR_CODES.VALIDATION_MISSING_FIELD;
  }
  return ERROR_CODES.VALIDATION_INVALID_FORMAT;
}

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.number().int(),
    message: z.string(),
    category: ErrorCategorySchema,
    retryable: z.boolean(),
    timestamp: IsoDateTimeSchema,
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
