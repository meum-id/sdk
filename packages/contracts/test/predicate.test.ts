import { describe, expect, test } from 'bun:test';
import { MAX_CONJUNCTION_SIZE, NAMED_CLAIMS, PredicateSchema } from '../src/index';

describe('predicate grammar', () => {
  test.each([...NAMED_CLAIMS])('named claim %s accepts', (claim) => {
    expect(PredicateSchema.safeParse(claim).success).toBe(true);
  });

  test('unknown claim rejects', () => {
    expect(PredicateSchema.safeParse('age_over_25').success).toBe(false);
    expect(PredicateSchema.safeParse('locale_GB').success).toBe(false);
  });

  test('vocabulary is exactly the 7 frozen claims', () => {
    expect(NAMED_CLAIMS).toEqual([
      'age_over_18',
      'age_over_21',
      'sex_M',
      'sex_F',
      'sex_X',
      'locale_US',
      'locale_US_CA',
    ]);
  });

  test('all_of of 1, 2, and 3 accepts', () => {
    expect(PredicateSchema.safeParse({ all_of: ['age_over_18'] }).success).toBe(true);
    expect(PredicateSchema.safeParse({ all_of: ['age_over_18', 'locale_US_CA'] }).success).toBe(true);
    expect(PredicateSchema.safeParse({ all_of: ['age_over_21', 'sex_F', 'locale_US'] }).success).toBe(true);
  });

  test('empty all_of rejects', () => {
    expect(PredicateSchema.safeParse({ all_of: [] }).success).toBe(false);
  });

  test('all_of with 4 elements rejects', () => {
    expect(MAX_CONJUNCTION_SIZE).toBe(3);
    expect(PredicateSchema.safeParse({ all_of: ['age_over_18', 'age_over_21', 'sex_M', 'locale_US'] }).success).toBe(
      false,
    );
  });

  test('duplicate all_of elements reject', () => {
    expect(PredicateSchema.safeParse({ all_of: ['age_over_18', 'age_over_18'] }).success).toBe(false);
  });

  test('non-array all_of rejects', () => {
    expect(PredicateSchema.safeParse({ all_of: 'age_over_18' }).success).toBe(false);
    expect(PredicateSchema.safeParse({ all_of: { claim: 'age_over_18' } }).success).toBe(false);
  });

  test('unknown claim inside all_of rejects', () => {
    expect(PredicateSchema.safeParse({ all_of: ['age_over_99'] }).success).toBe(false);
  });

  test('extra keys next to all_of reject', () => {
    expect(PredicateSchema.safeParse({ all_of: ['age_over_18'], any_of: ['sex_M'] }).success).toBe(false);
  });
});
