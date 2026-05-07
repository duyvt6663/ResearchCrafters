import * as React from "react";
import { cn } from "../lib/cn.js";

/**
 * ErrorPanel — typed surface for the standard error boundaries
 * (runner-offline, mentor-unavailable, stage-locked, stale-cli, etc.).
 *
 * Authored copy for each `kind` lives in `@researchcrafters/ui/copy`. This
 * component is a presentational wrapper; it does not author its own strings.
 */
export type ErrorPanelKind =
  | "runner-offline"
  | "mentor-unavailable"
  | "stage-locked"
  | "stale-cli"
  | "generic";

export interface ErrorPanelProps {
  kind: ErrorPanelKind;
  title: string;
  body: string;
  /** Primary call-to-action label. When omitted, no button is rendered. */
  cta?: string | undefined;
  /** Optional href for the CTA. When omitted, the CTA is non-navigating. */
  retryHref?: string | undefined;
  /** Optional details (e.g. error correlation id, version mismatch). */
  details?: string | undefined;
  className?: string;
}

export function ErrorPanel({
  kind,
  title,
  body,
  cta,
  retryHref,
  details,
  className,
}: ErrorPanelProps) {
  return (
    <section
      role="alert"
      data-error-kind={kind}
      className={cn(
        "flex flex-col gap-2 rounded-[--radius-rc-md] border border-[--color-rc-border] bg-[--color-rc-surface] px-4 py-5",
        className,
      )}
    >
      <h2 className="text-[--text-rc-md] font-semibold">{title}</h2>
      <p className="text-[--text-rc-sm] text-[--color-rc-text-muted]">{body}</p>
      {details ? (
        <pre className="rounded-[--radius-rc-sm] bg-[--color-rc-bg] p-2 font-[--font-rc-mono] text-[--text-rc-xs] text-[--color-rc-text-muted] whitespace-pre-wrap">
          {details}
        </pre>
      ) : null}
      {cta ? (
        retryHref ? (
          <a
            href={retryHref}
            className="inline-flex w-fit items-center rounded-[--radius-rc-md] border border-[--color-rc-border] px-3 py-1.5 text-[--text-rc-sm] font-medium text-[--color-rc-text] hover:bg-[--color-rc-surface-muted]"
          >
            {cta}
          </a>
        ) : (
          <button
            type="button"
            className="inline-flex w-fit items-center rounded-[--radius-rc-md] border border-[--color-rc-border] px-3 py-1.5 text-[--text-rc-sm] font-medium text-[--color-rc-text] hover:bg-[--color-rc-surface-muted]"
          >
            {cta}
          </button>
        )
      ) : null}
    </section>
  );
}
