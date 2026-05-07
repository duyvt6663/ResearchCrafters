"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";

/**
 * DecisionChoiceList — row-based list of choices for a decision stage.
 *
 * Per `docs/FRONTEND.md` section 9 Decision Stage: choices are row-based,
 * not oversized cards. Each row carries a label and a tradeoff summary; an
 * optional confidence selector lives outside this list.
 */
export interface DecisionChoice {
  id: string;
  label: string;
  tradeoff?: string;
  /** Optional one-line tradeoff/summary; if `tradeoff` is unset, used as fallback. */
  summary?: string;
  /** Marked when true; used by the parent for selection. */
  disabled?: boolean;
  /**
   * Whether this branch's identity is revealed. Hidden branches render with
   * a redacted label so the public surface does not leak the full graph.
   */
  revealed?: boolean;
  /**
   * Branch kind (canonical / suboptimal / failed / alternative). Used by
   * the host page to drive cohort framing — this list does not style on it.
   */
  type?: string;
}

export interface DecisionChoiceListProps {
  choices: ReadonlyArray<DecisionChoice>;
  selectedId?: string;
  /** Optional change handler. Omitted in read-only previews. */
  onChange?: (id: string) => void;
  /** Hidden label for the radio group. */
  ariaLabel?: string;
  className?: string;
  /**
   * Where to POST a chosen branch. Self-fetching widget mode — when set, the
   * component will eventually wire its own submit. For now this is a noop
   * pass-through used for prop-shape compatibility with the web app.
   *
   * TODO: wire to API.
   */
  submitHref?: string;
  /**
   * Active stage ref used to disambiguate the POST. Pairs with `submitHref`.
   *
   * TODO: wire to API.
   */
  stageRef?: string;
  /** Render the list non-interactive (e.g. on marketing surfaces). */
  readOnly?: boolean;
}

export function DecisionChoiceList({
  choices,
  selectedId,
  onChange,
  ariaLabel = "Decision choices",
  className,
  readOnly = false,
}: DecisionChoiceListProps) {
  return (
    <ul
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("flex flex-col gap-1.5", className)}
    >
      {choices.map((c) => {
        const checked = c.id === selectedId;
        const disabled = (c.disabled ?? false) || readOnly;
        const revealed = c.revealed ?? true;
        const tradeoff = c.tradeoff ?? c.summary;
        const label = revealed ? c.label : "Hidden branch";
        return (
          <li key={c.id}>
            <label
              className={cn(
                "flex items-start gap-2 rounded-[--radius-rc-sm] border p-3",
                disabled ? "cursor-not-allowed" : "cursor-pointer",
                checked
                  ? "border-[--color-rc-accent] bg-[--color-rc-accent-subtle]"
                  : "border-[--color-rc-border] hover:bg-[--color-rc-surface-muted]",
                c.disabled ? "opacity-50" : "",
                !revealed ? "opacity-70" : "",
              )}
            >
              <input
                type="radio"
                name="decision-choice"
                value={c.id}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange?.(c.id)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="text-[--text-rc-sm] font-medium">{label}</div>
                {tradeoff && revealed ? (
                  <div className="text-[--text-rc-xs] text-[--color-rc-text-muted] mt-0.5">
                    {tradeoff}
                  </div>
                ) : null}
              </div>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
