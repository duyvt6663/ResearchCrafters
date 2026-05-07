import type {
  StagePolicy,
  MentorVisibility,
  MentorVisibilityState,
} from '@researchcrafters/erp-schema';
import type { MentorContext } from './types.js';

/**
 * State of the world used to evaluate visibility triggers. The web app passes
 * these flags in based on `stage_attempts`, `grades`, and the package
 * enrollment progress.
 */
export interface VisibilityState {
  hasAttempt: boolean;
  hasPassed: boolean;
  hasCompletedPackage: boolean;
}

export interface BuildMentorContextInput {
  stageId: string;
  attempt: number;
  packageVersionId: string;
  stagePolicy: StagePolicy;
  visibilityState: VisibilityState;
  /** Loader callbacks — caller (web app) provides these wired to content-sdk. */
  loaders: {
    artifactRefs: ReadonlyArray<string>;
    loadArtifact: (ref: string) => Promise<{ ref: string; text: string }>;
    loadRubricCriteria: () => Promise<ReadonlyArray<string>>;
    loadBranchFeedback: () => Promise<
      ReadonlyArray<{ branchId: string; text: string }>
    >;
  };
  /**
   * Optional warning sink for refused visibility states. The web app should
   * forward these to telemetry so package authors see misconfigured policies.
   */
  warn?: (msg: string) => void;
}

/**
 * Scopes that are NEVER allowed to be set to `always` by a package author.
 * Setting them to `always` would defeat the entire mentor-safety story, so we
 * refuse to honour the request and emit a warning instead.
 */
const FORBIDDEN_ALWAYS_SCOPES: ReadonlyArray<keyof MentorVisibility> = [
  'canonical_solution',
  'branch_solutions',
];

export function isVisible(
  state: MentorVisibilityState,
  world: VisibilityState,
): boolean {
  switch (state) {
    case 'always':
      return true;
    case 'after_attempt':
      return world.hasAttempt;
    case 'after_pass':
      return world.hasPassed;
    case 'after_completion':
      return world.hasCompletedPackage;
    case 'never':
      return false;
  }
}

/**
 * Build a mentor context, strictly enforcing `stage_policy.mentor_visibility`.
 *
 * The function never reads files itself. It calls the loader callbacks only
 * for scopes whose visibility resolves to true under the current world state,
 * which means `solutions/canonical/` and branch solutions can never be loaded
 * unless visibility is `after_pass`/`after_completion` AND the world reports
 * those triggers as fired.
 */
export async function buildMentorContext(
  input: BuildMentorContextInput,
): Promise<MentorContext> {
  const { stagePolicy, visibilityState, loaders, warn } = input;
  const v = stagePolicy.mentor_visibility;

  // Hard guard: forbidden scopes can never be `always`.
  for (const scope of FORBIDDEN_ALWAYS_SCOPES) {
    if (v[scope] === 'always') {
      warn?.(
        `mentor_visibility.${scope} is set to 'always', which is forbidden by design. Treating as 'never'.`,
      );
    }
  }

  const allowed = (scope: keyof MentorVisibility): boolean => {
    if (FORBIDDEN_ALWAYS_SCOPES.includes(scope) && v[scope] === 'always') {
      return false;
    }
    return isVisible(v[scope], visibilityState);
  };

  const allowedScopes = (Object.keys(v) as Array<keyof MentorVisibility>).filter(allowed);

  // Artifact excerpts are gated by the artifact_refs scope.
  let artifactExcerpts: ReadonlyArray<{ ref: string; text: string }> = [];
  if (allowed('artifact_refs')) {
    artifactExcerpts = await Promise.all(
      loaders.artifactRefs.map((ref) => loaders.loadArtifact(ref)),
    );
  }

  let rubricCriteria: ReadonlyArray<string> | undefined;
  if (allowed('rubric')) {
    rubricCriteria = await loaders.loadRubricCriteria();
  }

  let branchFeedback: ReadonlyArray<{ branchId: string; text: string }> | undefined;
  if (allowed('branch_feedback')) {
    branchFeedback = await loaders.loadBranchFeedback();
  }

  const context: MentorContext = {
    stageId: input.stageId,
    attempt: input.attempt,
    packageVersionId: input.packageVersionId,
    allowedScopes,
    artifactExcerpts,
    redactionTargets: stagePolicy.mentor_redaction_targets ?? [],
    policySnapshot: stagePolicy,
    ...(rubricCriteria !== undefined ? { rubricCriteria } : {}),
    ...(branchFeedback !== undefined ? { branchFeedback } : {}),
  };

  return context;
}
