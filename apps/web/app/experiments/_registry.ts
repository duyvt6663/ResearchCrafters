import type { ComponentType, ReactElement } from "react";
import { Mock as M1SymbolPaletteMock } from "@experiments/m1-symbol-palette/Mock";
import { Mock as W1ClaimSkeletonMock } from "@experiments/w1-claim-skeleton/Mock";

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
 *   draft → validated → promoted | dropped
 */

export type ExperimentModule = "math" | "writing" | "coding" | "shared";
export type ExperimentStatus =
  | "draft"
  | "validated"
  | "promoted"
  | "dropped";

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
  "m1-symbol-palette": {
    slug: "m1-symbol-palette",
    title: "M1 — Symbol Palette",
    module: "math",
    status: "promoted",
    summary:
      "Click-to-assemble math chips with hover-gloss tooltips. Promoted to packages/ui as `SymbolPalette`; opt-in via `DerivationStep.inputMode = 'palette'`.",
    Mock: M1SymbolPaletteMock,
  },
  "w1-claim-skeleton": {
    slug: "w1-claim-skeleton",
    title: "W1 — Claim Skeleton",
    module: "writing",
    status: "promoted",
    summary:
      "Rubric-keyed reorderable cards replace the free-text editor for scaffolded claim drafting. Promoted to packages/ui as `ClaimSkeleton`; opt-in via the `skeleton` prop on `WritingWorkbench`.",
    Mock: W1ClaimSkeletonMock,
  },
};

export const experimentSlugs = Object.keys(experiments);

export function getExperiment(slug: string): ExperimentEntry | undefined {
  return experiments[slug];
}
