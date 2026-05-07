/**
 * Typed copy library for ResearchCrafters.
 *
 * Authored, safety- and tone-sensitive strings only. Never produced by an LLM.
 * Engineers MUST import from this module instead of inventing inline strings.
 *
 * Public shape: `cope.<category>.<key>(args?)` — see TODOS/09 Copy Library.
 */

import {
  paywall,
  previewBoundary,
  lockedStage,
  mentorWithoutEntitlement,
  type PaywallCopy,
  type PaywallCopyArgs,
  type PaywallVariant,
} from "./paywall.js";
import {
  mentorRefusal,
  mentorRefusalDefaults,
  type MentorRefusalArgs,
  type MentorRefusalCopy,
  type MentorRefusalScope,
} from "./mentor-refusal.js";
import {
  executionFailure,
  executionFailureCopy,
  type ExecutionFailureCopy,
  type ExecutionFailureKind,
} from "./execution-failure.js";
import { runnerOffline, type RunnerOfflineCopy } from "./runner-offline.js";
import {
  mentorUnavailable,
  type MentorUnavailableCopy,
} from "./mentor-unavailable.js";
import {
  stageLocked,
  type StageLockedArgs,
  type StageLockedCopy,
} from "./stage-locked.js";
import {
  rareBranch,
  suppressedNode,
  type RareBranchCopy,
  type SuppressedNodeCopy,
} from "./branch-suppression.js";
import {
  emptyCatalog,
  singlePackageEarlyState,
  type EmptyStateCopy,
} from "./empty-states.js";
import {
  migrationDiff,
  type MigrationDiffArgs,
  type MigrationDiffCopy,
} from "./migration.js";
import {
  staleCli,
  type StaleCliArgs,
  type StaleCliCopy,
} from "./cli-warnings.js";

export const cope = {
  paywall: {
    previewBoundary,
    lockedStage,
    mentorWithoutEntitlement,
  },
  mentor: {
    refusal: mentorRefusal,
    unavailable: mentorUnavailable,
    refusalDefaults: mentorRefusalDefaults,
  },
  execution: {
    failure: executionFailure,
    timeout: executionFailureCopy.timeout,
    oom: executionFailureCopy.oom,
    crash: executionFailureCopy.crash,
    exit_nonzero: executionFailureCopy.exit_nonzero,
  },
  runner: {
    offline: runnerOffline,
  },
  stage: {
    locked: stageLocked,
  },
  branch: {
    rare: rareBranch,
    suppressedNode,
  },
  empty: {
    catalog: emptyCatalog,
    singlePackageEarly: singlePackageEarlyState,
  },
  migration: {
    diff: migrationDiff,
  },
  cli: {
    stale: staleCli,
  },
} as const;

export type CopeNamespace = typeof cope;

/**
 * `copy` — flat, app-facing namespace authored alongside `cope`.
 *
 * The `cope` export above mirrors the TODOS spec one-to-one (function-keyed
 * entries that can take args). `copy` is a sibling, more ergonomic surface
 * intended for the web app's pages: pre-applied copy with shapes the page
 * components consume directly. Keep both exports in sync — when a string
 * appears in both, derive `copy` from `cope` so authored strings live in
 * one place.
 *
 * If you add a key here, also document the corresponding spec entry in the
 * relevant `TODOS/*.md` and (where applicable) reference it from `cope`.
 */
const _emptyCatalog = emptyCatalog();
const _runnerOffline = runnerOffline();
const _mentorUnavailable = mentorUnavailable();
const _stageLocked = stageLocked();
const _staleCliExample = staleCli({ installed: "0.0.0", expected: "0.0.0" });

export const copy = {
  brand: {
    name: "ResearchCrafters",
  },
  nav: {
    catalog: "Catalog",
    myPackages: "My packages",
  },
  landing: {
    heroTitle: "Rebuild the research behind famous AI papers.",
    heroSubtitle:
      "Practice the decisions, implementations, experiments, and writing that produced them.",
  },
  emptyStates: {
    emptyCatalog: {
      title: _emptyCatalog.title,
      body: _emptyCatalog.body,
      ...(_emptyCatalog.cta !== undefined ? { cta: _emptyCatalog.cta } : {}),
    },
  },
  errors: {
    runnerOffline: {
      title: _runnerOffline.title,
      body: _runnerOffline.body,
      cta: _runnerOffline.retryCta,
    },
    mentorUnavailable: {
      title: _mentorUnavailable.title,
      body: _mentorUnavailable.body,
      cta: _mentorUnavailable.degradeCta,
    },
    stageLocked: {
      title: _stageLocked.title,
      body: _stageLocked.body,
      cta: _stageLocked.cta,
    },
    staleCli: {
      title: _staleCliExample.title,
      body: "Your CLI is older than this stage expects. Older versions can produce stale runner behavior or fail upload.",
      cta: _staleCliExample.upgradeCta,
    },
  },
  packageOverview: {
    startCta: "Start the first stage",
    graphPreviewTitle: "Decision graph preview",
    graphPreviewBody:
      "Each node is a decision; branches show canonical, alternative, and suboptimal paths.",
    sampleDecisionTitle: "Sample decision",
    evidenceTitle: "Sample evidence",
    waitlistCta: "Join the waitlist",
    priceCta: (monthlyUsd: number) =>
      monthlyUsd > 0 ? `Buy — $${monthlyUsd}/month` : "Buy",
  },
  stagePlayer: {
    openOnDesktop:
      "Open this stage on a desktop terminal — CLI stages need a workstation.",
    reflectionPlaceholder:
      "Write a short reflection on the decisions you made and what you would change.",
  },
  mentor: {
    policyAllowedContext: [
      "stage prompt",
      "your draft answer",
      "rubric dimensions",
      "in-scope evidence refs",
    ] as ReadonlyArray<string>,
  },
  share: {
    captureTitle: "Share your run",
    captureBody:
      "Capture an immutable summary of your decisions, scores, and the hardest call you made.",
    insightLabel: "Your insight (optional)",
    publishCta: "Publish share card",
    unshareCta: "Unshare",
  },
} as const;

export type CopyNamespace = typeof copy;

// Re-export named modules so callers can also import directly.
export {
  paywall,
  previewBoundary,
  lockedStage,
  mentorWithoutEntitlement,
  mentorRefusal,
  mentorRefusalDefaults,
  executionFailure,
  executionFailureCopy,
  runnerOffline,
  mentorUnavailable,
  stageLocked,
  rareBranch,
  suppressedNode,
  emptyCatalog,
  singlePackageEarlyState,
  migrationDiff,
  staleCli,
};

export type {
  PaywallCopy,
  PaywallCopyArgs,
  PaywallVariant,
  MentorRefusalArgs,
  MentorRefusalCopy,
  MentorRefusalScope,
  ExecutionFailureCopy,
  ExecutionFailureKind,
  RunnerOfflineCopy,
  MentorUnavailableCopy,
  StageLockedArgs,
  StageLockedCopy,
  RareBranchCopy,
  SuppressedNodeCopy,
  EmptyStateCopy,
  MigrationDiffArgs,
  MigrationDiffCopy,
  StaleCliArgs,
  StaleCliCopy,
};
