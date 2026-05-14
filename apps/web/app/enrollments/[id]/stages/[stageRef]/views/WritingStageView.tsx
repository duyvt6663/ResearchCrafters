"use client";

import * as React from "react";
import {
  WritingWorkbench,
  type SkeletonSpec,
  type EvidenceItem,
  type RubricDimension,
} from "@researchcrafters/ui/components";

/**
 * WritingStageView — the writing-stage workbench, rendered as a client
 * component so `WritingWorkbench`'s controlled `draft.value` / `draft.onChange`
 * have somewhere to live above the server-component stage page.
 *
 * Used when the stage YAML authors `inputs.skeleton` (promoted from
 * experiment W1). The stage page falls back to `RichAnswerEditor` when no
 * skeleton is configured.
 *
 * Submit posts the assembled draft string to `/api/stage-attempts`. Autosave
 * is a follow-up.
 */

export interface WritingStageViewProps {
  stageRef: string;
  skeleton: SkeletonSpec;
  rubric: ReadonlyArray<RubricDimension>;
  evidence: ReadonlyArray<EvidenceItem>;
}

export function WritingStageView({
  stageRef,
  skeleton,
  rubric,
  evidence,
}: WritingStageViewProps): React.ReactElement {
  const [draft, setDraft] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitState, setSubmitState] = React.useState<
    "idle" | "passed" | "partial" | "failed"
  >("idle");

  const onSubmit = async () => {
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stage-attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageRef, answer: draft }),
      });
      if (!res.ok) {
        setSubmitState("failed");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        passed?: boolean;
        partial?: boolean;
      };
      setSubmitState(body.passed ? "passed" : body.partial ? "partial" : "failed");
    } catch {
      setSubmitState("failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <WritingWorkbench
        evidence={evidence}
        draft={{ value: draft, onChange: setDraft }}
        rubric={rubric}
        skeleton={skeleton}
      />
      <div className="flex items-center justify-end gap-2">
        {submitState !== "idle" ? (
          <span
            className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em]"
            style={{
              color:
                submitState === "passed"
                  ? "var(--color-rc-icon-accent)"
                  : submitState === "partial"
                    ? "var(--color-rc-warning)"
                    : "var(--color-rc-danger)",
            }}
            data-rc-writing-stage-submit-state={submitState}
          >
            {submitState}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || !draft.trim()}
          className="rounded-(--radius-rc-md) bg-(--color-rc-accent) px-4 py-2 text-(--text-rc-sm) font-semibold text-(--color-rc-accent-foreground) hover:bg-(--color-rc-accent-hover) disabled:opacity-60"
          data-rc-writing-stage-submit
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
