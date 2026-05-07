import type { z } from 'zod';
import type {
  packageSchema,
  graphSchema,
  stageSchema,
  branchSchema,
  rubricSchema,
  hintSchema,
  runnerSchema,
} from '@researchcrafters/erp-schema';

export type PackageMeta = z.infer<typeof packageSchema>;
export type Graph = z.infer<typeof graphSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type Branch = z.infer<typeof branchSchema>;
export type Rubric = z.infer<typeof rubricSchema>;
export type Hint = z.infer<typeof hintSchema>;
export type Runner = z.infer<typeof runnerSchema>;

export interface StageRecord {
  ref: string;
  path: string;
  data: Stage;
}

export interface BranchRecord {
  ref: string;
  path: string;
  data: Branch;
}

export interface RubricRecord {
  ref: string;
  path: string;
  data: Rubric;
}

export interface HintRecord {
  ref: string;
  path: string;
  data: Hint;
}

export interface SolutionsIndex {
  canonicalFiles: string[];
  branchFiles: string[];
}

export interface ArtifactIndex {
  paperMd: string | null;
  logicFiles: string[];
  srcFiles: string[];
  traceTreePath: string | null;
  evidencePaths: string[];
}

export interface LoadedPackage {
  root: string;
  package: PackageMeta;
  graph: Graph;
  stages: StageRecord[];
  branches: BranchRecord[];
  rubrics: RubricRecord[];
  hints: HintRecord[];
  runner: Runner | null;
  solutions: SolutionsIndex;
  artifact: ArtifactIndex;
}

export type ValidationLayer =
  | 'structural'
  | 'ara-cross-link'
  | 'sandbox'
  | 'pedagogy';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface Issue {
  layer: ValidationLayer;
  code: string;
  message: string;
  severity: IssueSeverity;
  path?: string;
  ref?: string;
  pending?: boolean;
}

export interface ValidationReport {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  info: Issue[];
}

export interface PackageBuildManifest {
  package: {
    slug: string;
    title: string;
    version: string;
    status: PackageMeta['status'];
    difficulty: PackageMeta['difficulty'];
    estimated_time_minutes: number;
    paper: PackageMeta['paper'];
  };
  graphNodes: Array<{
    id: string;
    type: Graph['nodes'][number]['type'];
    title: string;
    stagePath: string;
    stageRef: string | null;
    artifactRefs: string[];
    unlocks: string[];
    unlocksByChoice: Record<string, string[]>;
    choices: Array<{ id: string; branchRef: string }>;
  }>;
  stages: Array<{
    id: string;
    ref: string;
    type: Stage['type'];
    title: string;
    difficulty: Stage['difficulty'];
    estimatedMinutes: number;
    runnerMode: Stage['stage_policy']['runner']['mode'];
    validationKind: Stage['stage_policy']['validation']['kind'];
    inputMode: Stage['stage_policy']['inputs']['mode'];
    artifactRefs: string[];
    rubricRef?: string;
    hintsRef?: string;
    passThreshold?: number;
  }>;
  branches: Array<{
    id: string;
    ref: string;
    type: Branch['type'];
    supportLevel: Branch['support_level'];
    choice: string;
    evidenceRefs: string[];
    sourceRefs: string[];
    nextNodes: string[];
  }>;
  rubrics: Array<{
    id: string;
    ref: string;
    passThreshold: number;
    dimensionCount: number;
  }>;
  fixtures: Array<{
    stageRef: string;
    path: string;
    sha256: string;
  }>;
}
