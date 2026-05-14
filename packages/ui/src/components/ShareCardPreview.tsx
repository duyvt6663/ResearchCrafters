"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import { StatusBadge } from "./StatusBadge.js";
import { rareBranch } from "../copy/branch-suppression.js";
import type { StatusKey } from "../tokens.js";

/**
 * ShareCardPreview — clean technical-report tile.
 *
 * Constraints (`docs/FRONTEND.md` section 14 + backlog/06 minimum-N rules):
 *  - No meme styling.
 *  - No spoilers from hidden answers.
 *  - Cohort percentage hidden when `cohortPercentage === undefined`; we
 *    surface authored rare-branch copy so the omission is intentional.
 */
export type ShareBranchKind = "canonical" | "alternative" | "suboptimal";

/**
 * Snapshot payload mirrored from the eventual share-card row (backlog/06).
 * The web app passes this shape directly; the component derives display
 * values from it.
 */
export interface ShareCardPayload {
  packageSlug?: string;
  packageVersionId?: string;
  completionStatus?: "complete" | "in_progress" | "fail";
  scoreSummary?: { passed: number; total: number } | string;
  hardestDecision?: string;
  selectedBranchType?: ShareBranchKind;
  /**
   * Cohort percentage already suppressed when below minimum-N. `null` means
   * suppressed; `undefined` means unknown.
   */
  cohortPercentage?: number | null;
  learnerInsight?: string;
}

export interface ShareCardPreviewProps {
  /** Direct render mode: pre-derived display title. */
  packageTitle?: string;
  /** Direct render mode: status badge. */
  status?: Extract<StatusKey, "pass" | "partial" | "completed" | "fail">;
  /** Direct render mode: score summary (string). */
  scoreSummary?: string;
  hardestDecision?: string;
  branchKind?: ShareBranchKind;
  /** When provided, must already obey minimum-N suppression rules. */
  cohortPercentage?: number;
  insight?: string;
  className?: string;
  /**
   * Payload-render mode (the web app's share page). When supplied, the
   * component derives all display fields from this snapshot.
   */
  payload?: ShareCardPayload;
  /** Label for the learner-insight capture area in payload mode. */
  captureLabel?: string;
  /** CTA label for publishing the share card. */
  publishLabel?: string;
  /** CTA label for unsharing a previously published card. */
  unshareLabel?: string;
  /** Where to POST the share-card publish action. */
  publishHref?: string;
}

const BRANCH_LABEL: Record<ShareBranchKind, string> = {
  canonical: "Canonical branch",
  alternative: "Alternative branch",
  suboptimal: "Suboptimal branch",
};

function deriveScoreString(
  raw: ShareCardPayload["scoreSummary"],
): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "string") return raw;
  return `${raw.passed}/${raw.total}`;
}

function deriveStatus(
  payload: ShareCardPayload | undefined,
): Extract<StatusKey, "pass" | "partial" | "completed" | "fail"> {
  if (!payload?.completionStatus) return "completed";
  if (payload.completionStatus === "complete") return "completed";
  if (payload.completionStatus === "fail") return "fail";
  return "partial";
}

export function ShareCardPreview({
  packageTitle,
  status,
  scoreSummary,
  hardestDecision,
  branchKind,
  cohortPercentage,
  insight,
  className,
  payload,
  captureLabel,
  publishLabel,
  unshareLabel,
}: ShareCardPreviewProps) {
  // Derive payload-mode fields. Direct props win when both are supplied.
  const derivedTitle =
    packageTitle ?? payload?.packageSlug ?? "Run summary";
  const derivedStatus: Extract<
    StatusKey,
    "pass" | "partial" | "completed" | "fail"
  > = status ?? deriveStatus(payload);
  const derivedScore = scoreSummary ?? deriveScoreString(payload?.scoreSummary);
  const derivedHardest = hardestDecision ?? payload?.hardestDecision;
  const derivedBranch = branchKind ?? payload?.selectedBranchType;
  // Payload's `null` cohort means "suppressed"; `undefined` means unknown.
  const cohortPct =
    cohortPercentage ??
    (payload?.cohortPercentage === null
      ? undefined
      : payload?.cohortPercentage);
  const derivedInsight = insight ?? payload?.learnerInsight;

  const cohortHidden = cohortPct === undefined;
  const cohortCopy = cohortHidden ? rareBranch() : null;
  return (
    <article
      data-card="true"
      className={cn(
        "w-[320px] rounded-(--radius-rc-lg) border border-(--color-rc-border) bg-(--color-rc-bg) p-4",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-(--text-rc-md) font-semibold leading-snug">
          {derivedTitle}
        </h3>
        <StatusBadge status={derivedStatus} size="sm" />
      </header>

      <dl className="grid grid-cols-2 gap-2 text-(--text-rc-xs)">
        {derivedScore ? (
          <div>
            <dt className="text-(--color-rc-text-muted)">Score</dt>
            <dd className="font-(--font-rc-mono) text-(--color-rc-text)">
              {derivedScore}
            </dd>
          </div>
        ) : null}
        {derivedBranch ? (
          <div>
            <dt className="text-(--color-rc-text-muted)">Branch</dt>
            <dd className="text-(--color-rc-text)">
              {BRANCH_LABEL[derivedBranch]}
            </dd>
          </div>
        ) : null}
        {derivedHardest ? (
          <div className="col-span-2">
            <dt className="text-(--color-rc-text-muted)">Hardest decision</dt>
            <dd className="text-(--color-rc-text)">{derivedHardest}</dd>
          </div>
        ) : null}
        <div className="col-span-2">
          <dt className="text-(--color-rc-text-muted)">Cohort</dt>
          <dd className="text-(--color-rc-text)">
            {cohortCopy ? (
              <span title={cohortCopy.description}>{cohortCopy.label}</span>
            ) : (
              `${Math.round(cohortPct as number)}%`
            )}
          </dd>
        </div>
      </dl>

      {derivedInsight ? (
        <p className="mt-3 text-(--text-rc-sm) text-(--color-rc-text)">
          “{derivedInsight}”
        </p>
      ) : captureLabel ? (
        <p className="mt-3 text-(--text-rc-xs) text-(--color-rc-text-muted)">
          {captureLabel}
        </p>
      ) : null}

      {publishLabel || unshareLabel ? (
        <div className="mt-3 flex items-center gap-2">
          {publishLabel ? (
            <button
              type="button"
              className="rounded-(--radius-rc-md) border border-(--color-rc-border) px-3 py-1.5 text-(--text-rc-sm) font-medium text-(--color-rc-text) hover:bg-(--color-rc-surface-muted)"
            >
              {publishLabel}
            </button>
          ) : null}
          {unshareLabel ? (
            <button
              type="button"
              className="rounded-(--radius-rc-md) border border-(--color-rc-border) px-3 py-1.5 text-(--text-rc-sm) font-medium text-(--color-rc-text-muted) hover:bg-(--color-rc-surface-muted)"
            >
              {unshareLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
