"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import type { EvidenceItem } from "./EvidencePanel.js";

/**
 * ClaimSkeleton — rubric-keyed scaffolded writing editor.
 *
 * Promoted from `apps/web/experiments/w1-claim-skeleton/` after the W1
 * proposal validated (see that folder's writeup for goal / hypothesis /
 * validation criteria).
 *
 * The learner fills one card per rubric dimension and the cards are
 * concatenated (using `spec.joiner`, default `\n\n`) into a single string
 * that mirrors the `RichAnswerEditor` contract. Drop-in replacement for the
 * center pane of `WritingWorkbench` when `skeleton` is configured.
 *
 * State model: per-card text is held INTERNALLY. The parent sees only the
 * composed string via `onChange`. When the `value` prop arrives non-empty
 * on first render (rehydration), we split by `spec.joiner` and assign chunks
 * to the cards in `dimensions` order; remaining chunks land in the last
 * card so no content is lost. This is the documented v1 tradeoff — a
 * persistent per-card store is a separate proposal.
 *
 * Word-budget meter, evidence-ref insertion, and rubric "presence chips"
 * are all surfaced here so the proposal validates as a single coherent UI.
 */

export interface SkeletonDimension {
  id: string;
  /** Short label rendered on the card header and presence chip. */
  label: string;
  /** Inline prompt rendered above the textarea + reused as placeholder. */
  prompt: string;
  /** CSS variable name (e.g. `"--color-rc-info"`) for the card's left-edge
   *  accent and presence-chip color. Defaults to `"--color-rc-accent"`. */
  accentVar?: string;
}

export interface SkeletonSpec {
  dimensions: ReadonlyArray<SkeletonDimension>;
  /** Joiner used to assemble the cards into the submitted draft. Default `"\n\n"`. */
  joiner?: string;
  /** Word-budget hints surfaced to the learner. Both bounds optional. */
  wordBudget?: { min?: number; max?: number };
  /** Optional evidence items rendered in a right column with "Insert ref"
   *  buttons. When omitted, no evidence column renders. */
  evidence?: ReadonlyArray<EvidenceItem>;
  /** Dimension id that receives inserted `[ref:<id>]` tokens. Defaults to
   *  the first dimension whose `id` includes "evidence", else the last
   *  dimension in the list. */
  evidenceTargetDimensionId?: string;
}

export interface ClaimSkeletonProps {
  spec: SkeletonSpec;
  /** Composed draft value. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function resolveEvidenceTarget(spec: SkeletonSpec): string | null {
  if (spec.evidenceTargetDimensionId) return spec.evidenceTargetDimensionId;
  const e = spec.dimensions.find((d) => d.id.toLowerCase().includes("evidence"));
  if (e) return e.id;
  const last = spec.dimensions[spec.dimensions.length - 1];
  return last ? last.id : null;
}

function splitOnce(value: string, joiner: string, count: number): string[] {
  if (count <= 0) return [];
  if (!value) return new Array(count).fill("");
  if (count === 1) return [value];
  // Split into at most `count` chunks; remaining joiner-separated pieces
  // fold into the last chunk so we never silently drop content.
  const parts: string[] = [];
  let rest = value;
  while (parts.length < count - 1) {
    const i = rest.indexOf(joiner);
    if (i < 0) {
      parts.push(rest);
      rest = "";
      break;
    }
    parts.push(rest.slice(0, i));
    rest = rest.slice(i + joiner.length);
  }
  if (parts.length < count) parts.push(rest);
  while (parts.length < count) parts.push("");
  return parts;
}

export function ClaimSkeleton({
  spec,
  value,
  onChange,
  className,
}: ClaimSkeletonProps): React.ReactElement {
  const joiner = spec.joiner ?? "\n\n";
  const dimensionIds = spec.dimensions.map((d) => d.id);

  // Per-card text. Seeded once from `value`; from then on the component
  // owns the per-card store.
  const initialTexts = React.useMemo<Record<string, string>>(() => {
    const chunks = splitOnce(value, joiner, dimensionIds.length);
    const out: Record<string, string> = {};
    dimensionIds.forEach((id, i) => {
      out[id] = chunks[i] ?? "";
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [texts, setTexts] = React.useState<Record<string, string>>(initialTexts);
  const [order, setOrder] = React.useState<ReadonlyArray<string>>(dimensionIds);

  // Re-emit assembled string whenever per-card state changes.
  const assembled = order
    .map((id) => (texts[id] ?? "").trim())
    .filter(Boolean)
    .join(joiner);
  const lastEmitted = React.useRef<string>(assembled);
  React.useEffect(() => {
    if (lastEmitted.current !== assembled) {
      lastEmitted.current = assembled;
      onChange(assembled);
    }
  }, [assembled, onChange]);

  const updateText = (id: string, v: string) =>
    setTexts((prev) => ({ ...prev, [id]: v }));
  const move = (idx: number, dir: -1 | 1) => {
    const swap = idx + dir;
    if (swap < 0 || swap >= order.length) return;
    const next = [...order];
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    setOrder(next);
  };

  const evidenceTarget = resolveEvidenceTarget(spec);
  const insertRef = (refId: string) => {
    if (!evidenceTarget) return;
    setTexts((prev) => {
      const current = prev[evidenceTarget] ?? "";
      const pad = current === "" || current.endsWith(" ") ? "" : " ";
      return {
        ...prev,
        [evidenceTarget]: (current + pad + `[ref:${refId}]`).trimStart(),
      };
    });
  };

  const totalWords = countWords(assembled);
  const min = spec.wordBudget?.min;
  const max = spec.wordBudget?.max;
  let budgetTone: "under" | "ok" | "over" = "ok";
  if (min !== undefined && totalWords > 0 && totalWords < min) budgetTone = "under";
  else if (max !== undefined && totalWords > max) budgetTone = "over";

  const presence: Record<string, boolean> = {};
  for (const d of spec.dimensions) {
    presence[d.id] = (texts[d.id] ?? "").trim().length > 0;
  }

  const hasEvidence = !!(spec.evidence && spec.evidence.length > 0);

  return (
    <div
      className={cn("flex flex-col gap-4", className)}
      data-rc-claim-skeleton
    >
      {/* Rubric presence chips. */}
      <section className="flex flex-wrap items-center gap-2" aria-label="Rubric coverage">
        <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          Rubric coverage
        </span>
        {spec.dimensions.map((d) => {
          const on = presence[d.id];
          const accent = d.accentVar ?? "--color-rc-accent";
          return (
            <span
              key={d.id}
              className="inline-flex items-center gap-1.5 rounded-(--radius-rc-sm) border px-1.5 py-0.5 text-(--text-rc-xs)"
              style={{
                borderColor: on ? `var(${accent})` : "var(--color-rc-border)",
                color: on ? `var(${accent})` : "var(--color-rc-text-subtle)",
                background: on
                  ? `color-mix(in srgb, var(${accent}) 12%, transparent)`
                  : "transparent",
              }}
              data-rc-skeleton-presence={on ? "on" : "off"}
              data-dimension={d.id}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: on ? `var(${accent})` : "var(--color-rc-border)" }}
                aria-hidden
              />
              {d.label}
            </span>
          );
        })}
      </section>

      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          hasEvidence && "lg:grid-cols-[minmax(0,2.2fr)_minmax(220px,1fr)]",
        )}
      >
        {/* Cards. */}
        <section className="flex flex-col gap-2" aria-label="Claim cards">
          <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
            Cards · order matches the submitted draft
          </span>
          <ol className="flex flex-col gap-2" data-rc-skeleton-cards>
            {order.map((id, idx) => {
              const d = spec.dimensions.find((x) => x.id === id);
              if (!d) return null;
              const accent = d.accentVar ?? "--color-rc-accent";
              const wc = countWords(texts[id] ?? "");
              return (
                <li
                  key={id}
                  className="rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-3"
                  style={{ borderLeft: `3px solid var(${accent})` }}
                  data-rc-skeleton-card={id}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em]"
                        style={{ color: `var(${accent})` }}
                      >
                        {String(idx + 1).padStart(2, "0")} · {d.label}
                      </span>
                      <span className="text-(--text-rc-xs) text-(--color-rc-text-subtle)">
                        {wc} {wc === 1 ? "word" : "words"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Move up"
                        title="Move up"
                        className="rounded-(--radius-rc-sm) border border-(--color-rc-border) px-1.5 py-1 text-(--color-rc-text-muted) hover:bg-(--color-rc-surface-muted) disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(idx, 1)}
                        disabled={idx === order.length - 1}
                        aria-label="Move down"
                        title="Move down"
                        className="rounded-(--radius-rc-sm) border border-(--color-rc-border) px-1.5 py-1 text-(--color-rc-text-muted) hover:bg-(--color-rc-surface-muted) disabled:opacity-40"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                  <p className="mb-1.5 text-(--text-rc-xs) text-(--color-rc-text-subtle)">
                    {d.prompt}
                  </p>
                  <textarea
                    rows={2}
                    value={texts[id] ?? ""}
                    onChange={(e) => updateText(id, e.target.value)}
                    placeholder={d.prompt}
                    aria-label={d.label}
                    className="w-full resize-y rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-surface) p-2 text-(--text-rc-sm) leading-snug text-(--color-rc-text) focus:border-(--color-rc-accent) focus:outline-none"
                    data-rc-skeleton-card-input={id}
                  />
                </li>
              );
            })}
          </ol>
        </section>

        {/* Evidence column. */}
        {hasEvidence ? (
          <aside
            className="flex flex-col gap-2 rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-3"
            aria-label="Evidence"
          >
            <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
              Evidence · insert ref into the Evidence card
            </span>
            <ul className="flex flex-col gap-2">
              {spec.evidence!.map((e) => (
                <li
                  key={e.id}
                  className="rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-surface) p-2"
                >
                  <p className="text-(--text-rc-sm) font-medium text-(--color-rc-text)">
                    {e.title ?? e.id}
                  </p>
                  {e.kind ? (
                    <p className="font-(--font-rc-mono) text-[10px] text-(--color-rc-text-subtle)">
                      {e.kind}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => insertRef(e.id)}
                    className="mt-2 inline-flex items-center gap-1 rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg) px-2 py-1 text-(--text-rc-xs) text-(--color-rc-text) hover:border-(--color-rc-accent)"
                    aria-label={`Insert ref:${e.id} into the Evidence card`}
                    data-rc-skeleton-evidence-insert={e.id}
                  >
                    Insert <code className="font-(--font-rc-mono)">[ref:{e.id}]</code>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>

      {/* Word-budget meter. */}
      {min !== undefined || max !== undefined ? (
        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-(--text-rc-xs)">
            <span className="font-(--font-rc-mono) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
              Word budget
            </span>
            <span
              className="font-(--font-rc-mono)"
              style={{
                color:
                  budgetTone === "ok"
                    ? "var(--color-rc-icon-accent)"
                    : budgetTone === "under"
                      ? "var(--color-rc-warning)"
                      : "var(--color-rc-danger)",
              }}
              data-rc-skeleton-budget={budgetTone}
            >
              {totalWords}
              {min !== undefined && max !== undefined ? ` / ${min}–${max}` : null}
              {min !== undefined && max === undefined ? ` (min ${min})` : null}
              {min === undefined && max !== undefined ? ` (max ${max})` : null}
            </span>
          </div>
          {max !== undefined ? (
            <div
              className="relative h-2 w-full overflow-hidden rounded-full border border-(--color-rc-border) bg-(--color-rc-surface)"
              aria-hidden
            >
              <div
                className="absolute inset-y-0 left-0 transition-all"
                style={{
                  width: `${Math.min(100, (totalWords / max) * 100)}%`,
                  background:
                    budgetTone === "ok"
                      ? "var(--color-rc-icon-accent)"
                      : budgetTone === "under"
                        ? "var(--color-rc-warning)"
                        : "var(--color-rc-danger)",
                  opacity: 0.7,
                }}
              />
              {min !== undefined ? (
                <span
                  className="absolute inset-y-0 w-px bg-(--color-rc-border-strong)"
                  style={{ left: `${(min / max) * 100}%` }}
                  title={`min ${min}`}
                />
              ) : null}
              <span
                className="absolute inset-y-0 w-px bg-(--color-rc-border-strong)"
                style={{ left: "100%" }}
                title={`max ${max}`}
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
