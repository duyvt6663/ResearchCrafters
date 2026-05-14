"use client";

import * as React from "react";
import { LoginModal } from "@researchcrafters/ui/components";

/**
 * StartPackageCta — the package overview's "Start package" button.
 *
 * Behaviour:
 *  - Authenticated learners: behaves as before — navigates straight to
 *    `/packages/<slug>/start` so the server-side enrollment kickoff runs.
 *  - Signed-out learners: opens `LoginModal` over the overview page so the
 *    package title stays in view. The modal's GitHub button is wired to a
 *    server action that redirects back to the start route on success.
 *
 * The component is a thin client wrapper so the package overview page can
 * stay a server component (it still does the Prisma read).
 */

export interface StartPackageCtaProps {
  slug: string;
  packageTitle: string;
  isAuthenticated: boolean;
  /** Visible label, e.g. copy.packageOverview.startCta. */
  label: string;
  /** Server action: starts the GitHub OAuth flow with redirectTo wired. */
  onGithubSignIn: () => void | Promise<void>;
}

export function StartPackageCta({
  slug,
  packageTitle,
  isAuthenticated,
  label,
  onGithubSignIn,
}: StartPackageCtaProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  const buttonClasses =
    "inline-flex w-full items-center justify-center rounded-(--radius-rc-md) " +
    "bg-(--color-rc-accent) px-4 py-2.5 text-(--text-rc-sm) font-semibold " +
    "text-(--color-rc-accent-foreground) transition-colors duration-(--duration-rc-fast) " +
    "hover:bg-(--color-rc-accent-hover)";

  if (isAuthenticated) {
    return (
      <a href={`/packages/${slug}/start`} className={buttonClasses}>
        {label}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClasses}
      >
        {label}
      </button>
      <LoginModal
        open={open}
        onOpenChange={setOpen}
        contextTitle={packageTitle}
        onGithubSignIn={onGithubSignIn}
      />
    </>
  );
}
