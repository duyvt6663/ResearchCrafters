"use client";

import * as React from "react";
import {
  WritingWorkbench,
  Prose,
  type SkeletonSpec,
  type EvidenceItem,
  type RubricDimension,
} from "@researchcrafters/ui/components";

/**
 * W1 — Claim Skeleton mock (post-promotion).
 *
 * Now a thin demo over the production `WritingWorkbench` + `ClaimSkeleton`
 * primitives. We pass `skeleton` into `WritingWorkbench`, which swaps the
 * `RichAnswerEditor` for a `ClaimSkeleton` in the center pane while keeping
 * the rubric + mentor panes wired to the same draft string.
 */

const RUBRIC: ReadonlyArray<RubricDimension> = [
  {
    id: "mechanism",
    label: "Mechanism",
    description: "States what residual learning does.",
    weight: 1,
  },
  {
    id: "conditions",
    label: "Conditions",
    description: "Names depth, optimizer, BatchNorm, dataset.",
    weight: 1,
  },
  {
    id: "evidence",
    label: "Evidence",
    description: "Cites at least one [ref:<id>].",
    weight: 1,
  },
  {
    id: "scope",
    label: "Scope",
    description: "Notes where the claim does not apply.",
    weight: 1,
  },
];

const EVIDENCE: ReadonlyArray<EvidenceItem> = [
  {
    id: "plain-vs-residual",
    title: "Training curves: plain vs residual",
    kind: "artifact",
    source: "artifact/evidence/tables/training-curves.md#plain-vs-residual",
  },
  {
    id: "identity-shortcut",
    title: "Identity shortcut analysis",
    kind: "doc",
    source: "artifact/logic/claims.md#identity-is-the-trick",
  },
  {
    id: "depth-20-56",
    title: "Depth 20–56 study (CIFAR-10)",
    kind: "artifact",
    source: "artifact/evidence/tables/training-curves.md#cifar10-depth-sweep",
  },
];

const SKELETON: SkeletonSpec = {
  joiner: "\n\n",
  wordBudget: { min: 40, max: 160 },
  evidence: EVIDENCE,
  dimensions: [
    {
      id: "mechanism",
      label: "Mechanism",
      prompt: "State what residual learning does. One or two sentences.",
      accentVar: "--color-rc-info",
    },
    {
      id: "conditions",
      label: "Conditions",
      prompt:
        "Under what conditions does the claim hold? Name the depth, optimizer, BatchNorm setting, and dataset.",
      accentVar: "--color-rc-warning",
    },
    {
      id: "evidence",
      label: "Evidence",
      prompt: "Cite the supporting evidence. Use the Insert-ref buttons on the right.",
      accentVar: "--color-rc-icon-accent",
    },
    {
      id: "scope",
      label: "Scope",
      prompt: "Where does this NOT apply? Be honest about the limits of the claim.",
      accentVar: "--color-rc-accent",
    },
  ],
};

const TARGET_CLAIM = `Re-parameterizing each block of a deep CNN to learn a residual mapping $F(x) + x$ with a parameter-free identity shortcut allows training error on CIFAR-10 to *decrease* with depth from 20 to 56 layers under SGD with momentum and BatchNorm, whereas the plain counterpart's training error increases with depth (see \`artifact/evidence/tables/training-curves.md#plain-vs-residual\`).`;

export function Mock(): React.ReactElement {
  const [draft, setDraft] = React.useState("");
  const [showTarget, setShowTarget] = React.useState(false);

  return (
    <div
      className="flex flex-col gap-4 rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-5"
      data-rc-experiment="w1-claim-skeleton"
    >
      <header className="flex flex-col gap-1.5">
        <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          Stage S006 · live demo of <code className="font-(--font-rc-mono)">WritingWorkbench</code> with the <code className="font-(--font-rc-mono)">skeleton</code> prop
        </span>
        <h3 className="text-(--text-rc-lg) font-semibold text-(--color-rc-text)">
          Write a precise claim about residual learning.
        </h3>
      </header>

      <WritingWorkbench
        evidence={EVIDENCE}
        draft={{ value: draft, onChange: setDraft }}
        rubric={RUBRIC}
        skeleton={SKELETON}
      />

      <section className="flex flex-col gap-2">
        <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          Assembled draft · what would be submitted
        </span>
        <div className="min-h-[60px] rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-surface) p-3 text-(--color-rc-text)">
          {draft ? (
            <Prose size="sm">{draft}</Prose>
          ) : (
            <span className="text-(--text-rc-sm) text-(--color-rc-text-subtle)">
              (your draft will appear here as you fill the cards)
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowTarget((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-(--radius-rc-sm) border border-(--color-rc-border) px-2 py-1 text-(--text-rc-xs) text-(--color-rc-text-muted) hover:bg-(--color-rc-surface-muted)"
          >
            {showTarget ? "Hide target" : "Show target"}
          </button>
        </div>
        {showTarget ? (
          <div className="rounded-(--radius-rc-sm) border border-dashed border-(--color-rc-border) bg-(--color-rc-bg) p-3">
            <p className="mb-1.5 font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
              Target · canonical claim from 006-claim-writing.yaml
            </p>
            <Prose size="sm">{TARGET_CLAIM}</Prose>
          </div>
        ) : null}
      </section>
    </div>
  );
}
