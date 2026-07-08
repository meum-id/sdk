import { z } from 'zod';
import { MAX_CONJUNCTION_SIZE, NAMED_CLAIMS } from './claims';

export const NamedClaimSchema = z.enum(NAMED_CLAIMS);

export const AllOfPredicateSchema = z.strictObject({
  all_of: z
    .array(NamedClaimSchema)
    .min(1)
    .max(MAX_CONJUNCTION_SIZE)
    .refine((claims) => new Set(claims).size === claims.length, {
      message: 'all_of claims must be unique',
    }),
});
export type AllOfPredicate = z.infer<typeof AllOfPredicateSchema>;

export const PredicateSchema = z.union([NamedClaimSchema, AllOfPredicateSchema]);
export type Predicate = z.infer<typeof PredicateSchema>;
