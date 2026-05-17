import { describe, expect, it } from 'vitest';
import {
  COHORTS,
  COHORT_DEFINITIONS,
  PUBLIC_COHORTS,
  isCohort,
  isPublicCohort,
  type Cohort,
} from '../src/index.js';

describe('cohort definitions', () => {
  it('enumerates the four canonical cohorts', () => {
    expect([...COHORTS]).toEqual([
      'all_attempts',
      'completers',
      'entitled_paid',
      'alpha_beta',
    ]);
  });

  it('has a definition with a non-empty membership rule for every cohort', () => {
    for (const cohort of COHORTS) {
      const def = COHORT_DEFINITIONS[cohort];
      expect(def.key).toBe(cohort);
      expect(def.label.trim().length).toBeGreaterThan(0);
      expect(def.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('marks alpha_beta as non-public and the rest as public', () => {
    expect(COHORT_DEFINITIONS.alpha_beta.includeInPublicPercentages).toBe(false);
    for (const cohort of ['all_attempts', 'completers', 'entitled_paid'] as const) {
      expect(COHORT_DEFINITIONS[cohort].includeInPublicPercentages).toBe(true);
    }
  });

  it('excludes alpha_beta from PUBLIC_COHORTS and includes the other three', () => {
    expect([...PUBLIC_COHORTS].sort()).toEqual(
      ['all_attempts', 'completers', 'entitled_paid'].sort(),
    );
    expect(PUBLIC_COHORTS).not.toContain('alpha_beta' as Cohort);
  });
});

describe('isCohort', () => {
  it('accepts every known cohort string', () => {
    for (const cohort of COHORTS) {
      expect(isCohort(cohort)).toBe(true);
    }
  });

  it('rejects unknown strings and non-strings', () => {
    expect(isCohort('public')).toBe(false);
    expect(isCohort('')).toBe(false);
    expect(isCohort(null)).toBe(false);
    expect(isCohort(undefined)).toBe(false);
    expect(isCohort(42)).toBe(false);
    expect(isCohort({ key: 'all_attempts' })).toBe(false);
  });
});

describe('isPublicCohort', () => {
  it('rejects alpha_beta by default so it cannot leak into public percentages', () => {
    expect(isPublicCohort('alpha_beta')).toBe(false);
  });

  it('accepts cohorts marked public in COHORT_DEFINITIONS', () => {
    expect(isPublicCohort('all_attempts')).toBe(true);
    expect(isPublicCohort('completers')).toBe(true);
    expect(isPublicCohort('entitled_paid')).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isPublicCohort('staff')).toBe(false);
    expect(isPublicCohort(undefined)).toBe(false);
  });
});
