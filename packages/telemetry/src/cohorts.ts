/**
 * Branch-stat cohorts — single source of truth.
 *
 * Defines who belongs to each cohort (the membership rule) and whether the
 * cohort's percentages may surface in public, learner-facing UI. Anything
 * that reads or writes a `cohort` value (rollups, admin triggers, public
 * branch-percentage readers, share-card payloads, telemetry sinks) should
 * import from here rather than re-declaring the literal set.
 *
 * Membership rules are descriptive: the actual filtering happens in the
 * rollup query that consumes a cohort. The descriptions here are the
 * contract the rollup must implement, and the assertion `alpha_beta` is
 * filtered out of any default public-percentage path lives in
 * `PUBLIC_COHORTS` / `isPublicCohort`.
 */

export const COHORTS = [
  'all_attempts',
  'completers',
  'entitled_paid',
  'alpha_beta',
] as const;

export type Cohort = (typeof COHORTS)[number];

export interface CohortDefinition {
  key: Cohort;
  label: string;
  /**
   * Plain-English membership rule. Treat this as the contract the rollup
   * query must implement when filtering `node_traversals` for this cohort.
   */
  description: string;
  /**
   * Whether percentages computed against this cohort may appear in public,
   * learner-facing UI by default. `alpha_beta` is false so internal
   * pre-release populations do not skew the numbers learners see.
   */
  includeInPublicPercentages: boolean;
}

export const COHORT_DEFINITIONS: Readonly<Record<Cohort, CohortDefinition>> = {
  all_attempts: {
    key: 'all_attempts',
    label: 'All attempts',
    description:
      'Every user who reached the decision node, regardless of completion or entitlement.',
    includeInPublicPercentages: true,
  },
  completers: {
    key: 'completers',
    label: 'Completers',
    description:
      'Users who completed the package (terminal stage passed) at any point before the window end.',
    includeInPublicPercentages: true,
  },
  entitled_paid: {
    key: 'entitled_paid',
    label: 'Paid / team entitled',
    description:
      'Users whose active entitlement at the time of the branch selection was paid or team (excludes free-tier and complimentary access).',
    includeInPublicPercentages: true,
  },
  alpha_beta: {
    key: 'alpha_beta',
    label: 'Alpha / beta',
    description:
      'Users in pre-release access cohorts (alpha allowlist, internal beta groups). Tracked separately so launch-team behavior does not pollute learner-facing percentages.',
    includeInPublicPercentages: false,
  },
};

/**
 * Cohorts whose percentages may appear in public, learner-facing UI by
 * default. Derived from `COHORT_DEFINITIONS` so flipping a cohort's
 * visibility only requires editing one place.
 */
export const PUBLIC_COHORTS: readonly Cohort[] = COHORTS.filter(
  (c) => COHORT_DEFINITIONS[c].includeInPublicPercentages,
);

const PUBLIC_COHORT_SET: ReadonlySet<Cohort> = new Set(PUBLIC_COHORTS);

export function isCohort(value: unknown): value is Cohort {
  return typeof value === 'string' && (COHORTS as readonly string[]).includes(value);
}

/**
 * True when this cohort's percentages may be served on public, learner-facing
 * surfaces by default. Internal/admin surfaces may still read non-public
 * cohorts explicitly; this guard is for the default public reader path.
 */
export function isPublicCohort(value: unknown): value is Cohort {
  return isCohort(value) && PUBLIC_COHORT_SET.has(value);
}
