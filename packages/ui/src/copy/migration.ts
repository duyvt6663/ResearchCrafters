/**
 * Package-version migration UX copy.
 *
 * Per `backlog/06-data-access-analytics.md`, migrations are opt-in. The diff
 * summary should be plain English so learners can decide whether to take the
 * new version (which may reset stage state) or keep the version they started.
 */

export interface MigrationDiffArgs {
  changedStages: string[];
  resetStateNotice: boolean;
}

export interface MigrationDiffCopy {
  title: string;
  body: string;
  bullets: string[];
  acceptCta: string;
  declineCta: string;
}

export function migrationDiff(args: MigrationDiffArgs): MigrationDiffCopy {
  const { changedStages, resetStateNotice } = args;
  const stagesLine =
    changedStages.length === 0
      ? "No stages changed materially in this version."
      : `Changed stages: ${changedStages.join(", ")}.`;

  const bullets: string[] = [stagesLine];
  if (resetStateNotice) {
    bullets.push(
      "Accepting this update will reset your in-progress stage state.",
    );
  } else {
    bullets.push("Your in-progress stage state will be preserved.");
  }
  bullets.push(
    "You can keep using the version you started; updates are opt-in.",
  );

  return {
    title: "A new version of this package is available.",
    body: "Review what changed and choose whether to migrate. Your previous attempts and grades are kept either way.",
    bullets,
    acceptCta: "Migrate to the new version",
    declineCta: "Keep my current version",
  };
}
