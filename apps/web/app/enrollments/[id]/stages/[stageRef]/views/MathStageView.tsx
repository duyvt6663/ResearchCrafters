"use client";

import * as React from "react";
import {
  MathWorkspace,
  type DerivationStep,
  type PaletteSpec,
} from "@researchcrafters/ui/components";

/**
 * MathStageView — the math-stage workbench, rendered as a client component so
 * the controlled state of `MathWorkspace` (derivation value, validation state,
 * etc.) has somewhere to live above the server-component stage page.
 *
 * For Phase 2 we wire a single blank derivation step driven by the stage's
 * authored `PaletteSpec`. Multi-step derivations + persistence/autosave are
 * intentional follow-ups — they'll be authored under `task.derivation` in the
 * stage YAML and wired through the same view.
 *
 * Submit posts a single string (the composed LaTeX) to
 * `/api/stage-attempts`, matching the contract already in use by
 * `RichAnswerEditor`. No autosave yet.
 */

export interface MathStageViewProps {
  stageRef: string;
  prompt: string;
  palette: PaletteSpec;
}

type SubmitState = "idle" | "validating" | "passed" | "partial" | "failed";

export function MathStageView({
  stageRef,
  prompt,
  palette,
}: MathStageViewProps): React.ReactElement {
  const [value, setValue] = React.useState("");
  const [state, setState] = React.useState<SubmitState>("idle");

  const onSubmit = async () => {
    if (!value.trim()) return;
    setState("validating");
    try {
      const res = await fetch("/api/stage-attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageRef, answer: value }),
      });
      if (!res.ok) {
        setState("failed");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        passed?: boolean;
        partial?: boolean;
      };
      setState(body.passed ? "passed" : body.partial ? "partial" : "failed");
    } catch {
      setState("failed");
    }
  };

  const steps: ReadonlyArray<DerivationStep> = [
    {
      id: `${stageRef}-prompt`,
      kind: "given",
      label: "Stage prompt",
      // The stage prompt is freeform markdown; surface it as a label and
      // leave the math body to the blank step the learner fills in.
      expressionLatex: "H(x) = F(x) + x",
    },
    {
      id: `${stageRef}-answer`,
      kind: "blank",
      label: "Build your answer",
      inputMode: "palette",
      palette,
      value,
      onChange: setValue,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {prompt ? (
        <p className="text-(--text-rc-sm) leading-relaxed text-(--color-rc-text-muted)">
          {prompt}
        </p>
      ) : null}
      <MathWorkspace
        derivation={{ steps, showValidation: false }}
        state={state}
        onSubmit={onSubmit}
      />
    </div>
  );
}
