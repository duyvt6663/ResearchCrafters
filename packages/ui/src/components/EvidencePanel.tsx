"use client";

import * as React from "react";
import { ExternalLink, FileText, Link as LinkIcon } from "lucide-react";
import { cn } from "../lib/cn.js";

/**
 * EvidencePanel — list of in-scope artifacts (papers, tables, prior runs)
 * for the active stage. The `AnswerEditor` may insert refs from this panel.
 *
 * Note: Only show evidence that is in scope per the stage policy. Do not
 * leak artifacts from other stages (mentor anti-pattern carries through).
 */
export type EvidenceKind = "doc" | "link" | "artifact";

export interface EvidenceItem {
  id: string;
  title: string;
  kind: EvidenceKind;
  href?: string;
  /** Short attribution / source line. */
  source?: string;
  /** Whether the ref belongs to the stage's verified allow-list. */
  verified?: boolean;
}

export interface EvidencePanelProps {
  /**
   * Items in scope for this stage. Optional so the panel can self-fetch
   * when only `stageRef` is provided.
   */
  items?: ReadonlyArray<EvidenceItem>;
  onInsertRef?: (item: EvidenceItem) => void;
  className?: string;
  /**
   * Stage ref to fetch evidence for. Self-fetching variant — pairs with the
   * future `/api/stages/:ref/evidence` endpoint.
   *
   * TODO: wire to API.
   */
  stageRef?: string;
}

const KIND_ICON = {
  doc: FileText,
  link: LinkIcon,
  artifact: ExternalLink,
} as const;

export function EvidencePanel({
  items,
  onInsertRef,
  className,
}: EvidencePanelProps) {
  const sourceItems = items ?? [];
  return (
    <section
      aria-label="Evidence"
      className={cn("flex flex-col gap-2", className)}
    >
      {sourceItems.length === 0 ? (
        <p className="text-(--text-rc-sm) text-(--color-rc-text-muted)">
          No evidence is in scope for this stage.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sourceItems.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded-(--radius-rc-sm) border border-(--color-rc-border) p-2"
              >
                <Icon
                  size={14}
                  aria-hidden
                  className="mt-0.5 text-(--color-rc-text-muted)"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-(--text-rc-sm) font-medium truncate">
                    {item.href ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </div>
                  {item.source ? (
                    <div className="text-(--text-rc-xs) text-(--color-rc-text-muted) truncate">
                      {item.source}
                    </div>
                  ) : null}
                  {item.verified !== undefined ? (
                    <div
                      className="mt-1 font-(--font-rc-mono) text-[10px] uppercase tracking-[0.08em] text-(--color-rc-text-subtle)"
                      data-rc-evidence-verification={
                        item.verified ? "verified" : "unverified"
                      }
                    >
                      {item.verified ? "Verified" : "Unverified"}
                    </div>
                  ) : null}
                </div>
                {onInsertRef ? (
                  <button
                    type="button"
                    onClick={() => onInsertRef(item)}
                    className="flex-none rounded-(--radius-rc-sm) border border-(--color-rc-border) px-1.5 py-0.5 text-(--text-rc-xs) text-(--color-rc-text-muted) hover:bg-(--color-rc-surface-muted)"
                  >
                    Insert ref
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
