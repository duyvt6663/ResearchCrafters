"use client";

import * as React from "react";
import { AlertTriangle, ShieldOff, Gauge, Wallet } from "lucide-react";
import { cn } from "../lib/cn.js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./Tabs.js";
import { StatusBadge } from "./StatusBadge.js";
import type { MentorRefusalCopy } from "../copy/mentor-refusal.js";

/**
 * MentorPanel — skeleton with mode tabs (Hint, Clarify, Review draft,
 * Explain branch) and policy/usage badges.
 *
 * Per `TODOS/09` Component Behaviors:
 *  - Surfaces what context is allowed for the current stage.
 *  - Shows authored refusal copy (never model-generated) via `refusal` slot.
 *  - Shows rate-limit and budget-cap badges from `05-mentor-safety.md`.
 *
 * Anti-pattern: never let the model generate the refusal text — pass
 * authored copy from `cope.mentor.refusal({ scope })`.
 */
export type MentorMode = "hint" | "clarify" | "review_draft" | "explain_branch";

export interface MentorPanelProps {
  /**
   * Active mode. Optional so callers that only pass `stageRef` can let the
   * panel manage its own mode state.
   */
  mode?: MentorMode;
  /** Mode change handler, paired with `mode`. */
  onModeChange?: (mode: MentorMode) => void;
  /**
   * Stage policy: which artifacts are in scope for the mentor.
   * Optional so the web app can pass `policyCopy` (a sibling alias) instead.
   */
  allowedContext?: ReadonlyArray<string>;
  /**
   * Alias for `allowedContext` used by the web app. When both are supplied,
   * `allowedContext` wins.
   */
  policyCopy?: ReadonlyArray<string>;
  /** Authored refusal copy when policy denies the request. */
  refusal?: MentorRefusalCopy | undefined;
  /** True when the per-window rate limit is reached. */
  rateLimited?: boolean;
  /** True when the session/budget cap is reached. */
  budgetCapReached?: boolean;
  /** Slot for the active mode's interactive UI (input box, message list). */
  children?: React.ReactNode;
  className?: string;
  /**
   * Stage ref the panel should bind to. Self-fetching variant — pairs with
   * the future `/api/mentor/messages?stageRef=...` endpoint.
   *
   * TODO: wire to API.
   */
  stageRef?: string;
  /**
   * Where to POST mentor messages. Pairs with `stageRef`.
   *
   * TODO: wire to API.
   */
  postHref?: string;
}

const MODE_LABELS: Record<MentorMode, string> = {
  hint: "Hint",
  clarify: "Clarify",
  review_draft: "Review draft",
  explain_branch: "Explain branch",
};

export function MentorPanel({
  mode,
  onModeChange,
  allowedContext,
  policyCopy,
  refusal,
  rateLimited = false,
  budgetCapReached = false,
  children,
  className,
}: MentorPanelProps) {
  const [internalMode, setInternalMode] = React.useState<MentorMode>("hint");
  const activeMode: MentorMode = mode ?? internalMode;
  const handleModeChange = (next: MentorMode) => {
    if (onModeChange) {
      onModeChange(next);
    } else {
      setInternalMode(next);
    }
  };
  const scope = allowedContext ?? policyCopy ?? [];
  return (
    <section
      aria-label="Mentor"
      className={cn(
        "flex flex-col gap-3 rounded-[--radius-rc-md] border border-[--color-rc-border] bg-[--color-rc-bg] p-3",
        className,
      )}
    >
      {/* Header: usage badges */}
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-[--text-rc-md] font-semibold">Mentor</h2>
        <div className="flex items-center gap-1.5">
          {rateLimited ? (
            <StatusBadge
              status="retry"
              label="Rate-limited"
              size="sm"
              aria-label="Rate-limited"
            />
          ) : null}
          {budgetCapReached ? (
            <StatusBadge
              status="locked"
              label="Budget cap"
              size="sm"
              aria-label="Budget cap reached"
            />
          ) : null}
        </div>
      </header>

      {/* Allowed context */}
      <div className="rounded-[--radius-rc-sm] bg-[--color-rc-surface] px-2.5 py-2 text-[--text-rc-xs] text-[--color-rc-text-muted]">
        <div className="font-medium text-[--color-rc-text] mb-1">
          Allowed context
        </div>
        {scope.length === 0 ? (
          <div>No artifacts are in scope for the current stage.</div>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {scope.map((c) => (
              <li
                key={c}
                className="inline-flex items-center rounded-[--radius-rc-sm] border border-[--color-rc-border] px-1.5 py-0.5"
              >
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Refusal banner (authored copy only) */}
      {refusal ? (
        <div
          role="alert"
          className="rounded-[--radius-rc-sm] border border-[--color-rc-warning] bg-[--color-rc-warning-subtle] p-2.5 text-[--text-rc-sm] text-[--color-rc-text]"
        >
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle size={14} aria-hidden />
            {refusal.title}
          </div>
          <p className="mt-1 text-[--color-rc-text-muted]">{refusal.body}</p>
          <p className="mt-1 text-[--color-rc-text-muted]">{refusal.hint}</p>
        </div>
      ) : null}

      {/* Mode tabs */}
      <Tabs
        value={activeMode}
        onValueChange={(v) => handleModeChange(v as MentorMode)}
      >
        <TabsList aria-label="Mentor mode">
          {(Object.keys(MODE_LABELS) as MentorMode[]).map((m) => (
            <TabsTrigger key={m} value={m}>
              {MODE_LABELS[m]}
            </TabsTrigger>
          ))}
        </TabsList>
        {(Object.keys(MODE_LABELS) as MentorMode[]).map((m) => (
          <TabsContent key={m} value={m}>
            {m === activeMode ? children : null}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

// Re-export icons for downstream consumers that want to compose related UI
// without re-importing lucide everywhere.
export const MentorPanelIcons = {
  Refusal: ShieldOff,
  RateLimit: Gauge,
  BudgetCap: Wallet,
};
