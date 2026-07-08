/**
 * The bounded predicate vocabulary, dependency-free so runtime consumers can
 * import it without pulling Zod. `locale` claims are ISO-3166-2: `locale_US`
 * is a string-prefix match on the holder locale, `locale_US_CA` is exact.
 */
export const NAMED_CLAIMS = [
  'age_over_18',
  'age_over_21',
  'sex_M',
  'sex_F',
  'sex_X',
  'locale_US',
  'locale_US_CA',
] as const;

export type NamedClaim = (typeof NAMED_CLAIMS)[number];

export const MAX_CONJUNCTION_SIZE = 3;
