"use client";

import * as React from "react";
import {
  CheckCircle2,
  CircleAlert,
  XCircle,
  Lock,
  Lightbulb,
} from "lucide-react";
import { cn } from "../lib/cn.js";
import { renderInlineMath } from "../lib/math.js";

/**
 * DerivationStepList — a sequential list of derivation steps for a math
 * stage. Each step is one of:
 *  - `given`: a locked/known step (rendered with a small gray lock icon).
 *  - `blank`: an editable input the learner fills in (renders an input plus
 *    a live KaTeX preview underneath as the learner types).
 *  - `computed`: a step the learner has already submitted whose value is
 *    pinned (shows the validation chip).
 *
 * Workbench surface — restraint applies. Validation feedback NEVER reveals
 * the canonical solution before policy allows it (we surface "passed" /
 * "wrong" / "partial" only — no diff against a hidden answer, no hints
 * unless the learner explicitly toggles them per step).
 *
 * KaTeX rendering uses `react-katex`'s `BlockMath` / `InlineMath` (SSR-safe).
 * If `react-katex` is unavailable the component falls back to a mono <code>
 * span so the page still renders cleanly.
 */
export type DerivationStepValidation = "pending" | "passed" | "wrong" | "partial";

export interface DerivationStep {
  id: string;
  kind: "given" | "blank" | "computed";
  /** Human label shown above the math, e.g. "Step 1: chain rule". */
  label?: string;
  /** LaTeX expression for given/computed steps. */
  expressionLatex?: string;
  /** Placeholder text for blank steps. */
  blankPlaceholder?: string;
  /** Current value of the blank (controlled). */
  value?: string;
  onChange?: (value: string) => void;
  validation?: DerivationStepValidation;
  /** Hint string shown when the user toggles the hint chip. */
  hint?: string;
}

export interface DerivationStepListProps {
  steps: ReadonlyArray<DerivationStep>;
  className?: string;
  /**
   * When true, the per-step validation chips and the hint toggle are visible
   * even on locked stages. Default: true. Pass `false` if your stage is in
   * "review" mode where you only show pinned values.
   */
  showValidation?: boolean;
}

const VALIDATION_ICON: Record<
  DerivationStepValidation,
  { icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>; tone: string; label: string }
> = {
  pending: { icon: CircleAlert, tone: "text-(--color-rc-text-subtle)", label: "Pending" },
  passed: { icon: CheckCircle2, tone: "text-(--color-rc-icon-accent)", label: "Passed" },
  partial: { icon: CircleAlert, tone: "text-(--color-rc-warning)", label: "Partial" },
  wrong: { icon: XCircle, tone: "text-(--color-rc-danger)", label: "Wrong" },
};

export function DerivationStepList({
  steps,
  className,
  showValidation = true,
}: DerivationStepListProps) {
  const [openHints, setOpenHints] = React.useState<Record<string, boolean>>({});
  return (
    <ol
      className={cn("flex flex-col gap-3", className)}
      data-rc-derivation
      aria-label="Derivation steps"
    >
      {steps.map((step, idx) => {
        const validation: DerivationStepValidation = step.validation ?? "pending";
        const ValidationIcon = VALIDATION_ICON[validation].icon;
        const validationTone = VALIDATION_ICON[validation].tone;
        const validationLabel = VALIDATION_ICON[validation].label;
        const hintOpen = !!openHints[step.id];
        return (
          <li
            key={step.id}
            data-rc-derivation-step
            data-step-kind={step.kind}
            data-validation={validation}
            className={cn(
              "rc-math-step rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-3",
              "flex flex-col gap-2",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="font-(--font-rc-mono) text-[11px] uppercase tracking-[0.08em] text-(--color-rc-text-subtle)"
                  aria-hidden
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                {step.kind === "given" ? (
                  <Lock
                    size={12}
                    aria-hidden
                    className="text-(--color-rc-locked)"
                    data-rc-derivation-lock
                  />
                ) : null}
                {step.label ? (
                  <span className="text-(--text-rc-sm) font-medium text-(--color-rc-text) truncate">
                    {step.label}
                  </span>
                ) : null}
              </div>
              {showValidation && step.kind !== "given" ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-(--text-rc-xs)",
                    validationTone,
                  )}
                  data-rc-derivation-validation={validation}
                  aria-label={validationLabel}
                  role="status"
                >
                  <ValidationIcon size={14} aria-hidden />
                  <span>{validationLabel}</span>
                </span>
              ) : null}
            </div>

            {/* Math body */}
            {step.kind === "given" || step.kind === "computed" ? (
              <div className="rc-math-step-expression text-(--text-rc-base) text-(--color-rc-text)">
                {renderInlineMath(step.expressionLatex ?? "")}
              </div>
            ) : null}

            {step.kind === "blank" ? (
              <div className="flex flex-col gap-1.5">
                <input
                  type="text"
                  inputMode="text"
                  spellCheck={false}
                  placeholder={
                    step.blankPlaceholder ?? "Enter LaTeX, e.g. \\frac{dy}{dx}"
                  }
                  value={step.value ?? ""}
                  onChange={(e) => step.onChange?.(e.target.value)}
                  aria-label={step.label ?? `Step ${idx + 1} answer`}
                  className={cn(
                    "w-full rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg)",
                    "px-2.5 py-1.5 font-(--font-rc-mono) text-(--text-rc-sm) text-(--color-rc-text)",
                    "focus:outline-none focus:border-(--color-rc-accent)",
                  )}
                  data-rc-derivation-input
                />
                {step.value ? (
                  <div
                    className="rc-math-step-preview text-(--text-rc-sm) text-(--color-rc-text-muted)"
                    data-rc-derivation-preview
                  >
                    {renderInlineMath(step.value)}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Hint chip */}
            {step.hint && step.kind !== "given" ? (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setOpenHints((prev) => ({ ...prev, [step.id]: !prev[step.id] }))
                  }
                  className={cn(
                    "self-start inline-flex items-center gap-1 rounded-(--radius-rc-sm) border border-(--color-rc-border)",
                    "px-2 py-1 text-(--text-rc-xs) text-(--color-rc-text-muted) hover:bg-(--color-rc-surface-muted)",
                  )}
                  aria-expanded={hintOpen}
                  data-rc-derivation-hint-toggle
                >
                  <Lightbulb
                    size={12}
                    aria-hidden
                    className="text-(--color-rc-icon-accent)"
                  />
                  {hintOpen ? "Hide hint" : "Show hint"}
                </button>
                {hintOpen ? (
                  <p
                    className="text-(--text-rc-xs) text-(--color-rc-text-muted) leading-snug"
                    data-rc-derivation-hint
                  >
                    {step.hint}
                  </p>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
