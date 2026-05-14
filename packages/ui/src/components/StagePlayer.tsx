"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";

/**
 * StagePlayer — three-column layout that hosts a stage attempt.
 *
 * Desktop:   [ StageMap | Workspace | ContextPanel ]
 * Tablet:    [ Workspace | ContextPanel ]  (StageMap collapses to a top strip)
 * Mobile:    [ Workspace ]                 (others become tabs/sheets)
 *
 * Slots are render-prop friendly to keep this layout dumb. Composition with
 * `StageMap`, `RunStatusPanel`, etc. happens at the app level.
 *
 * Behavior contract:
 *  - The primary action (e.g. Submit) is sticky at the bottom on mobile and
 *    pinned to the workspace footer on desktop.
 *  - A stage opened under entitlement is NEVER interrupted mid-attempt by a
 *    paywall (per `backlog/09` Anti-Patterns). PaywallModal must only mount on
 *    natural boundaries — controlled by the caller, not this layout.
 */
export interface StagePlayerProps {
  /** Stage map column (left). On mobile becomes a sheet/tab. */
  stageMap: React.ReactNode;
  /** Center workspace — task prompt + interactive surface. */
  workspace: React.ReactNode;
  /** Right context panel — tabs (Evidence / Feedback / Mentor / Logs). */
  contextPanel: React.ReactNode;
  /** Sticky primary action; rendered in the workspace footer. */
  primaryAction?: React.ReactNode;
  /** Optional header strip with title, progress, secondary actions. */
  header?: React.ReactNode;
  /** Mobile sheet open state for the right panel. */
  mobileContextOpen?: boolean;
  onMobileContextOpenChange?: (open: boolean) => void;
  /** Mobile sheet open state for the stage map. */
  mobileMapOpen?: boolean;
  onMobileMapOpenChange?: (open: boolean) => void;
  className?: string;
}

export function StagePlayer({
  stageMap,
  workspace,
  contextPanel,
  primaryAction,
  header,
  mobileContextOpen = false,
  mobileMapOpen = false,
  className,
}: StagePlayerProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-(--color-rc-bg) text-(--color-rc-text)",
        className,
      )}
    >
      {header ? (
        <div className="border-b border-(--color-rc-border) px-4 py-2">
          {header}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_360px]">
        {/* Stage map */}
        <aside
          aria-label="Stage map"
          className={cn(
            "border-r border-(--color-rc-border) bg-(--color-rc-surface) overflow-auto",
            "hidden lg:block",
            mobileMapOpen ? "fixed inset-0 z-40 block lg:static" : "",
          )}
        >
          {stageMap}
        </aside>

        {/* Workspace */}
        <main className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-auto p-4">{workspace}</div>
          {primaryAction ? (
            <div
              className={cn(
                "sticky bottom-0 z-10 border-t border-(--color-rc-border) bg-(--color-rc-bg) p-3",
                "flex items-center justify-end gap-2",
              )}
            >
              {primaryAction}
            </div>
          ) : null}
        </main>

        {/* Context panel */}
        <aside
          aria-label="Stage context"
          className={cn(
            "border-l border-(--color-rc-border) bg-(--color-rc-surface) overflow-auto",
            "hidden lg:block",
            mobileContextOpen ? "fixed inset-0 z-40 block lg:static" : "",
          )}
        >
          {contextPanel}
        </aside>
      </div>
    </div>
  );
}
