"use client";

import * as React from "react";
import { Send, CheckCircle2, CircleAlert, XCircle, Loader2 } from "lucide-react";
import { cn } from "../lib/cn.js";
import {
  DerivationStepList,
  type DerivationStepListProps,
} from "./DerivationStepList.js";
import {
  ShapeTableEditor,
  type ShapeTableEditorProps,
} from "./ShapeTableEditor.js";
import {
  ToyExamplePanel,
  type ToyExampleProps,
} from "./ToyExamplePanel.js";

/**
 * MathWorkspace — the top-level host for an interactive math stage.
 *
 * Layout: 2-column grid on desktop —
 *   left:  derivation list (top), shape table (bottom)
 *   right: toy example (top), explanation editor (bottom)
 * Single column on mobile (we expose `data-mobile` so tests can assert the
 * layout flips even without a viewport simulation).
 *
 * Workbench surface — restraint applies. The sticky submit pill at the
 * bottom-right is tinted by the validation state but is never larger than
 * the surrounding chrome — submit is the primary action, not a hero.
 *
 * Validation feedback in any sub-zone NEVER reveals the canonical
 * derivation / shape values / output before policy allows it. The state
 * tint is a high-level signal, not a diff.
 */
export interface MathWorkspaceState {
  state?: "idle" | "validating" | "passed" | "partial" | "failed";
}

export interface MathWorkspaceProps extends MathWorkspaceState {
  derivation?: DerivationStepListProps;
  shapeTable?: ShapeTableEditorProps;
  toyExample?: ToyExampleProps;
  explanation?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  onSubmit?: () => void;
  className?: string;
}

const SUBMIT_TINT: Record<
  NonNullable<MathWorkspaceState["state"]>,
  { tone: string; icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>; label: string }
> = {
  idle: {
    tone: "border-(--color-rc-border) bg-(--color-rc-bg) text-(--color-rc-text)",
    icon: Send,
    label: "Submit",
  },
  validating: {
    tone: "border-(--color-rc-info) bg-(--color-rc-info-subtle) text-(--color-rc-info)",
    icon: Loader2,
    label: "Validating…",
  },
  passed: {
    tone: "border-(--color-rc-icon-accent) bg-(--color-rc-icon-accent-soft) text-(--color-rc-icon-accent)",
    icon: CheckCircle2,
    label: "Passed",
  },
  partial: {
    tone: "border-(--color-rc-warning) bg-(--color-rc-warning-subtle) text-(--color-rc-warning)",
    icon: CircleAlert,
    label: "Partial",
  },
  failed: {
    tone: "border-(--color-rc-danger) bg-(--color-rc-danger-subtle) text-(--color-rc-danger)",
    icon: XCircle,
    label: "Try again",
  },
};

function ZoneHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
        {title}
      </h3>
      {hint ? (
        <span className="text-(--text-rc-xs) text-(--color-rc-text-subtle)">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function MathWorkspace({
  derivation,
  shapeTable,
  toyExample,
  explanation,
  onSubmit,
  state = "idle",
  className,
}: MathWorkspaceProps) {
  const SubmitIcon = SUBMIT_TINT[state].icon;
  return (
    <section
      aria-label="Math workspace"
      data-rc-math-workspace
      data-state={state}
      className={cn("relative flex flex-col gap-4", className)}
    >
      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          "lg:grid-cols-2",
        )}
        data-mobile-layout="single"
        data-desktop-layout="two-col"
      >
        {/* LEFT column */}
        <div className="flex flex-col gap-4" data-rc-math-zone="left">
          {derivation ? (
            <div className="flex flex-col gap-2" data-rc-math-zone-name="derivation">
              <ZoneHeader title="Derivation" />
              <DerivationStepList {...derivation} />
            </div>
          ) : null}
          {shapeTable ? (
            <div className="flex flex-col gap-2" data-rc-math-zone-name="shape-table">
              <ZoneHeader title="Shape table" hint="Editable cells" />
              <ShapeTableEditor {...shapeTable} />
            </div>
          ) : null}
        </div>

        {/* RIGHT column */}
        <div className="flex flex-col gap-4" data-rc-math-zone="right">
          {toyExample ? (
            <div className="flex flex-col gap-2" data-rc-math-zone-name="toy-example">
              <ZoneHeader title="Toy example" />
              <ToyExamplePanel {...toyExample} />
            </div>
          ) : null}
          {explanation ? (
            <div
              className="flex flex-col gap-2"
              data-rc-math-zone-name="explanation"
            >
              <ZoneHeader title="Explanation" hint="Plain prose" />
              <textarea
                rows={6}
                value={explanation.value}
                onChange={(e) => explanation.onChange(e.target.value)}
                placeholder={
                  explanation.placeholder ??
                  "Explain what each step is doing in plain English…"
                }
                aria-label="Explanation"
                className={cn(
                  "w-full rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg)",
                  "p-3 text-(--text-rc-base) leading-snug text-(--color-rc-text)",
                  "focus:outline-none focus:border-(--color-rc-accent)",
                  "placeholder:text-(--color-rc-text-subtle)",
                )}
                data-rc-math-explanation
              />
            </div>
          ) : null}
        </div>
      </div>

      {onSubmit ? (
        <div
          className="sticky bottom-2 z-[1] flex justify-end"
          data-rc-math-submit-bar
        >
          <button
            type="button"
            onClick={onSubmit}
            disabled={state === "validating"}
            className={cn(
              "inline-flex items-center gap-2 rounded-(--radius-rc-md) border px-3 py-1.5 text-(--text-rc-sm)",
              "shadow-sm hover:opacity-90 disabled:opacity-70",
              SUBMIT_TINT[state].tone,
            )}
            data-rc-math-submit
            data-state={state}
          >
            <SubmitIcon
              size={14}
              aria-hidden
              className={cn(state === "validating" ? "animate-spin" : "")}
            />
            {SUBMIT_TINT[state].label}
          </button>
        </div>
      ) : null}
    </section>
  );
}
