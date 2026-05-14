import type { ComponentType, ReactElement } from 'react';
import { Mock as W2QuestionStackMock } from '../../experiments/w2-question-stack/Mock';

/**
 * Registry of UX experiments. Each entry is statically imported so the Next
 * bundler can tree-shake unused mocks and so an experiment that fails to
 * compile breaks the build loudly (rather than 404-ing in dev).
 *
 * To add an experiment:
 *   1. Scaffold `experiments/<slug>/` from `experiments/TEMPLATE/`.
 *   2. Add a single line below with the Mock import.
 *   3. Add the registry entry — keep keys in dependency-free alphabetical /
 *      module-grouped order so diffs read cleanly.
 *
 * Status lifecycle (see `experiments/README.md`):
 *   draft → validated → backlog → promoted → archived | dropped
 *
 * When an experiment reaches `archived`, move its folder to the repo-root
 * `archive/<slug>/` location AND remove its registry entry — archived
 * experiments don't appear at `/experiments` and don't ship a live mock.
 * The folder survives as a historical writeup with a `Findings` log that
 * explains the integration outcome.
 */

export type ExperimentModule = 'math' | 'writing' | 'coding' | 'shared';
export type ExperimentStatus =
  | 'draft'
  | 'validated'
  | 'backlog'
  | 'promoted'
  | 'archived'
  | 'dropped';

export interface ExperimentEntry {
  slug: string;
  title: string;
  module: ExperimentModule;
  status: ExperimentStatus;
  /** One-line description shown on the experiments index. */
  summary: string;
  /** The mock component rendered at /experiments/<slug>. */
  Mock: ComponentType<Record<string, never>> | (() => ReactElement);
}

export const experiments: Readonly<Record<string, ExperimentEntry>> = {
  'w2-question-stack': {
    slug: 'w2-question-stack',
    title: 'W2 - Question Stack',
    module: 'writing',
    status: 'draft',
    summary:
      'Split multi-part writing prompts into focused answer sections while keeping the package stage path in the left rail.',
    Mock: W2QuestionStackMock,
  },
};

export const experimentSlugs = Object.keys(experiments);

export function getExperiment(slug: string): ExperimentEntry | undefined {
  return experiments[slug];
}
