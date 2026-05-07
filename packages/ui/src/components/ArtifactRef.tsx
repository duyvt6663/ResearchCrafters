import * as React from "react";
import { ExternalLink, FileText } from "lucide-react";
import { cn } from "../lib/cn.js";

/**
 * ArtifactRef — compact reference chip pointing to a runner artifact, paper,
 * or evidence file. Inline-friendly; meant to be embedded in feedback,
 * grade panels, and answer text.
 */
export interface ArtifactRefProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "title"> {
  label: string;
  /** Optional short kind hint shown before the label, e.g. "log", "csv". */
  kind?: string;
  /** Set true to render as plain span (no link). */
  inert?: boolean;
}

export function ArtifactRef({
  label,
  kind,
  inert = false,
  className,
  href,
  ...rest
}: ArtifactRefProps) {
  const inner = (
    <>
      <FileText size={12} aria-hidden />
      {kind ? (
        <span className="font-(--font-rc-mono) text-(--color-rc-text-subtle)">
          {kind}
        </span>
      ) : null}
      <span className="font-(--font-rc-mono)">{label}</span>
      {!inert && href ? <ExternalLink size={10} aria-hidden /> : null}
    </>
  );
  const baseClass = cn(
    "inline-flex items-center gap-1 rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-surface) px-1.5 py-0.5 text-(--text-rc-xs) text-(--color-rc-text)",
    className,
  );
  if (inert || !href) {
    return <span className={baseClass}>{inner}</span>;
  }
  return (
    <a
      href={href}
      className={cn(baseClass, "hover:bg-(--color-rc-surface-muted)")}
      {...rest}
    >
      {inner}
    </a>
  );
}
