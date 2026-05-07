import * as React from "react";
import { AlertTriangle, Lock, WifiOff, MessageSquareOff } from "lucide-react";
import { cn } from "../lib/cn.js";

/**
 * ErrorPanel — typed surface for the standard error boundaries
 * (runner-offline, mentor-unavailable, stage-locked, stale-cli, etc.).
 *
 * Authored copy for each `kind` lives in `@researchcrafters/ui/copy`. This
 * component is a presentational wrapper; it does not author its own strings.
 *
 * Visual contract: calm warning surface using token-driven backgrounds. Per
 * `docs/FRONTEND.md` §16, every kind paints a stable container shape so users
 * can recognize the failure mode without reading body text.
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

const KIND_TONE: Record<
  ErrorPanelKind,
  { bg: string; border: string; fg: string; Icon: typeof AlertTriangle }
> = {
  "runner-offline": {
    bg: "bg-[--color-rc-warning-subtle]",
    border: "border-[--color-rc-warning]/30",
    fg: "text-[--color-rc-warning]",
    Icon: WifiOff,
  },
  "mentor-unavailable": {
    bg: "bg-[--color-rc-warning-subtle]",
    border: "border-[--color-rc-warning]/30",
    fg: "text-[--color-rc-warning]",
    Icon: MessageSquareOff,
  },
  "stage-locked": {
    bg: "bg-[--color-rc-locked-subtle]",
    border: "border-[--color-rc-locked]/30",
    fg: "text-[--color-rc-locked]",
    Icon: Lock,
  },
  "stale-cli": {
    bg: "bg-[--color-rc-warning-subtle]",
    border: "border-[--color-rc-warning]/30",
    fg: "text-[--color-rc-warning]",
    Icon: AlertTriangle,
  },
  generic: {
    bg: "bg-[--color-rc-surface]",
    border: "border-[--color-rc-border]",
    fg: "text-[--color-rc-text-muted]",
    Icon: AlertTriangle,
  },
};

export function ErrorPanel({
  kind,
  title,
  body,
  cta,
  retryHref,
  details,
  className,
}: ErrorPanelProps) {
  const tone = KIND_TONE[kind];
  const Icon = tone.Icon;
  return (
    <section
      role="alert"
      data-error-kind={kind}
      className={cn(
        "flex gap-4 rounded-[--radius-rc-md] border px-5 py-5",
        tone.bg,
        tone.border,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 inline-flex h-8 w-8 flex-none items-center justify-center rounded-full",
          "bg-[--color-rc-bg]/60",
          tone.fg,
        )}
      >
        <Icon size={16} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 className="text-[--text-rc-md] font-semibold text-[--color-rc-text]">
          {title}
        </h2>
        <p className="text-[--text-rc-sm] leading-relaxed text-[--color-rc-text-muted]">
          {body}
        </p>
        {details ? (
          <pre
            className={cn(
              "rounded-[--radius-rc-sm] border border-[--color-rc-border]",
              "bg-[--color-rc-bg] p-2 font-[--font-rc-mono] text-[--text-rc-xs]",
              "text-[--color-rc-text-muted] whitespace-pre-wrap",
            )}
          >
            {details}
          </pre>
        ) : null}
        {cta ? (
          retryHref ? (
            <a
              href={retryHref}
              className={cn(
                "mt-1 inline-flex w-fit items-center rounded-[--radius-rc-md]",
                "border border-[--color-rc-border] bg-[--color-rc-bg]",
                "px-3 py-1.5 text-[--text-rc-sm] font-medium text-[--color-rc-text]",
                "transition-colors duration-[--duration-rc-fast]",
                "hover:bg-[--color-rc-surface-muted]",
              )}
            >
              {cta}
            </a>
          ) : (
            <button
              type="button"
              className={cn(
                "mt-1 inline-flex w-fit items-center rounded-[--radius-rc-md]",
                "border border-[--color-rc-border] bg-[--color-rc-bg]",
                "px-3 py-1.5 text-[--text-rc-sm] font-medium text-[--color-rc-text]",
                "transition-colors duration-[--duration-rc-fast]",
                "hover:bg-[--color-rc-surface-muted]",
              )}
            >
              {cta}
            </button>
          )
        ) : null}
      </div>
    </section>
  );
}
