/**
 * Rare-branch suppression copy.
 *
 * Per `TODOS/06-data-access-analytics.md`, branch percentages are suppressed
 * below minimum-N (per-node N >= 20, per-branch N >= 5). The graph and the
 * share card both reuse these strings so we never invent inline text.
 */

export interface RareBranchCopy {
  label: string;
  description: string;
}

export function rareBranch(): RareBranchCopy {
  return {
    label: "Cohort data hidden",
    description:
      "Not enough learners have reached this branch to share a percentage. We hold off until the sample is large enough to be honest.",
  };
}

export interface SuppressedNodeCopy {
  label: string;
  description: string;
}

export function suppressedNode(): SuppressedNodeCopy {
  return {
    label: "Stats not yet available",
    description:
      "This node will show cohort statistics once enough learners have completed it. Until then, only your own outcome is shown.",
  };
}
