"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import { EvidencePanel, type EvidenceItem } from "./EvidencePanel.js";
import { RubricPanel, type RubricDimension } from "./RubricPanel.js";
import { MentorPanel, type MentorMode } from "./MentorPanel.js";
import { RichAnswerEditor } from "./RichAnswerEditor.js";
import { ClaimSkeleton, type SkeletonSpec } from "./ClaimSkeleton.js";

/**
 * WritingWorkbench — the academic-writing host the TODO calls for.
 *
 * Layout: 4 panes —
 *   left:        evidence column
 *   center:      rich-text draft editor
 *   right top:   rubric
 *   right bot:   mentor review
 *
 * Workbench surface — restraint applies. Citation insertion is the load
 * bearing affordance: clicking "Insert ref" on the evidence panel injects a
 * `[ref:<id>]` token into the draft at the caret. The token is opaque to
 * the editor — verification status and rendering happen at submission /
 * grade time.
 */
export interface WritingWorkbenchMentorReview {
  mode: MentorMode;
  /** Ad-hoc message list shape — we don't lock to `MentorMessageProps[]` so
   *  callers can pass partial data without coupling to the mentor surface. */
  messages?: ReadonlyArray<{ id: string; role: string; body: string }>;
  rateLimited?: boolean;
  budgetCapReached?: boolean;
  allowedContext?: ReadonlyArray<string>;
}

export interface WritingWorkbenchProps {
  evidence: ReadonlyArray<EvidenceItem>;
  draft: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  rubric: ReadonlyArray<RubricDimension>;
  mentorReview?: WritingWorkbenchMentorReview;
  /**
   * Called when the user clicks "Insert ref" on an evidence item. The
   * default implementation appends `[ref:<id>]` to the draft; pass a
   * function if your stage wants a different ref syntax.
   */
  onInsertCitation?: (item: EvidenceItem) => void;
  /**
   * Opt-in scaffolded editor (promoted from experiment W1). When provided,
   * the center pane renders a `ClaimSkeleton` instead of `RichAnswerEditor`.
   * The submitted artifact is still a single string passed through
   * `draft.value` / `draft.onChange`, so validation and grading do not
   * change. The skeleton owns its own evidence column (replacing the
   * separate left pane for the cite-into-card interaction). See
   * `apps/web/experiments/w1-claim-skeleton/README.md` for the rationale.
   */
  skeleton?: SkeletonSpec;
  className?: string;
}

export function WritingWorkbench({
  evidence,
  draft,
  rubric,
  mentorReview,
  onInsertCitation,
  skeleton,
  className,
}: WritingWorkbenchProps) {
  const draftRef = React.useRef<HTMLDivElement | null>(null);

  const insertCitation = (item: EvidenceItem) => {
    if (onInsertCitation) {
      onInsertCitation(item);
      return;
    }
    // Default: append `[ref:<id>]` to the draft. We try to insert at the
    // caret of the underlying textarea; otherwise we append.
    const ref = `[ref:${item.id}]`;
    const node = draftRef.current?.querySelector(
      "textarea",
    ) as HTMLTextAreaElement | null;
    if (node) {
      const start = node.selectionStart ?? draft.value.length;
      const end = node.selectionEnd ?? draft.value.length;
      const next =
        draft.value.slice(0, start) +
        ref +
        draft.value.slice(end);
      draft.onChange(next);
      requestAnimationFrame(() => {
        node.focus();
        try {
          const pos = start + ref.length;
          node.setSelectionRange(pos, pos);
        } catch {
          // ignore
        }
      });
      return;
    }
    draft.onChange(draft.value + ref);
  };

  return (
    <section
      aria-label="Writing workbench"
      data-rc-writing-workbench
      className={cn(
        "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2.5fr)_minmax(220px,1fr)]",
        className,
      )}
    >
      {/* LEFT: evidence */}
      <aside
        className="flex flex-col gap-2 rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-3"
        data-rc-writing-pane="evidence"
        data-card
      >
        <h3 className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          Evidence
        </h3>
        <EvidencePanel items={evidence} onInsertRef={insertCitation} />
      </aside>

      {/* CENTER: draft */}
      <div
        ref={draftRef}
        className="flex flex-col gap-2"
        data-rc-writing-pane="draft"
        data-rc-writing-draft-mode={skeleton ? "skeleton" : "free-prose"}
      >
        {skeleton ? (
          <ClaimSkeleton
            spec={skeleton}
            value={draft.value}
            onChange={draft.onChange}
          />
        ) : (
          <RichAnswerEditor
            value={draft.value}
            onChange={draft.onChange}
            {...(draft.placeholder ? { placeholder: draft.placeholder } : {})}
          />
        )}
      </div>

      {/* RIGHT: rubric + mentor review */}
      <div className="flex flex-col gap-3" data-rc-writing-pane="right">
        <div
          className="rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-3"
          data-rc-writing-pane="rubric"
          data-card
        >
          <RubricPanel dimensions={rubric} />
        </div>
        <div
          className="rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-3"
          data-rc-writing-pane="mentor"
          data-card
        >
          <h3 className="mb-2 font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
            Mentor review
          </h3>
          <MentorPanel
            mode={mentorReview?.mode ?? "review_draft"}
            {...(mentorReview?.allowedContext
              ? { allowedContext: mentorReview.allowedContext }
              : {})}
            {...(mentorReview?.rateLimited !== undefined
              ? { rateLimited: mentorReview.rateLimited }
              : {})}
            {...(mentorReview?.budgetCapReached !== undefined
              ? { budgetCapReached: mentorReview.budgetCapReached }
              : {})}
          >
            {mentorReview?.messages && mentorReview.messages.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {mentorReview.messages.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-(--radius-rc-sm) border border-(--color-rc-border) p-2 text-(--text-rc-sm)"
                  >
                    <span className="block font-(--font-rc-mono) text-(--text-rc-xs) text-(--color-rc-text-subtle)">
                      {m.role}
                    </span>
                    <span className="text-(--color-rc-text)">{m.body}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-(--text-rc-sm) text-(--color-rc-text-muted)">
                Submit a draft to request review.
              </p>
            )}
          </MentorPanel>
        </div>
      </div>
    </section>
  );
}
