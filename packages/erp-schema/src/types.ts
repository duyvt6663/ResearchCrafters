import type { z } from 'zod';
import type {
  packageSchema,
  paperSchema,
  releaseSchema,
  reviewSchema,
  statusEnum,
  difficultyEnum,
} from './schemas/package.js';
import type {
  graphSchema,
  graphNodeSchema,
  graphChoiceSchema,
  stageTypeEnum,
} from './schemas/graph.js';
import type {
  stageSchema,
  stagePolicySchema,
  mentorVisibilitySchema,
  mentorVisibilityStateEnum,
  runnerModeEnum,
  validationKindEnum,
  inputModeEnum,
} from './schemas/stage.js';
import type {
  branchSchema,
  branchTypeEnum,
  supportLevelEnum,
} from './schemas/branch.js';
import type { rubricSchema, rubricDimensionSchema } from './schemas/rubric.js';
import type { hintSchema, hintEntrySchema } from './schemas/hint.js';
import type {
  runnerSchema,
  runnerStageSchema,
  runnerFixtureSchema,
  runnerResourcesSchema,
  runnerNetworkEnum,
} from './schemas/runner.js';

export type Package = z.infer<typeof packageSchema>;
export type Paper = z.infer<typeof paperSchema>;
export type Release = z.infer<typeof releaseSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Status = z.infer<typeof statusEnum>;
export type Difficulty = z.infer<typeof difficultyEnum>;

export type Graph = z.infer<typeof graphSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphChoice = z.infer<typeof graphChoiceSchema>;
export type StageType = z.infer<typeof stageTypeEnum>;

export type Stage = z.infer<typeof stageSchema>;
export type StagePolicy = z.infer<typeof stagePolicySchema>;
export type MentorVisibility = z.infer<typeof mentorVisibilitySchema>;
export type MentorVisibilityState = z.infer<typeof mentorVisibilityStateEnum>;
export type RunnerMode = z.infer<typeof runnerModeEnum>;
export type ValidationKind = z.infer<typeof validationKindEnum>;
export type InputMode = z.infer<typeof inputModeEnum>;

export type Branch = z.infer<typeof branchSchema>;
export type BranchType = z.infer<typeof branchTypeEnum>;
export type SupportLevel = z.infer<typeof supportLevelEnum>;

export type Rubric = z.infer<typeof rubricSchema>;
export type RubricDimension = z.infer<typeof rubricDimensionSchema>;

export type Hint = z.infer<typeof hintSchema>;
export type HintEntry = z.infer<typeof hintEntrySchema>;

export type RunnerConfig = z.infer<typeof runnerSchema>;
export type RunnerStage = z.infer<typeof runnerStageSchema>;
export type RunnerFixture = z.infer<typeof runnerFixtureSchema>;
export type RunnerResources = z.infer<typeof runnerResourcesSchema>;
export type RunnerNetwork = z.infer<typeof runnerNetworkEnum>;
