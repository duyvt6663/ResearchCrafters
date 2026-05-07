"use client";

import * as React from "react";
import { Play, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "../lib/cn.js";

/**
 * ToyExamplePanel — small numeric example for math stages. Learner sees a
 * tiny input matrix, hits "Compute", and gets back their output vs the
 * expected output (only when wrong — passing answers stay quiet to avoid
 * leaking the canonical computation).
 *
 * Workbench surface — restraint applies. We only reveal the expected output
 * when `matches === false` AND the panel is configured to show it (the
 * stage policy may pin `showExpectedOnFail` for harder stages where even
 * the expected output is a spoiler).
 */
export interface ToyExampleInput {
  label: string;
  values: number[][];
  /** When true, the matrix cells are editable so the learner can poke. */
  editable?: boolean;
}

export interface ToyExampleResult {
  output: number[][];
  matches: boolean;
  /** Only revealed by callers when policy allows. */
  expected?: number[][];
}

export interface ToyExampleProps {
  inputMatrix: ToyExampleInput;
  expectedShape?: number[];
  /** Optional sanity-check target — e.g. "sum should be 0.7". */
  expectedSum?: number;
  onCompute: (input: number[][]) => Promise<ToyExampleResult>;
  /**
   * When false, the panel hides the expected matrix even on a mismatch and
   * shows only "Outputs disagree" + the difference at a high level. Default
   * true — most authors want the diff visible to make the bug obvious.
   */
  showExpectedOnFail?: boolean;
  className?: string;
}

function MatrixGrid({
  values,
  editable = false,
  onChange,
  ariaLabel,
  toneClassName,
}: {
  values: number[][];
  editable?: boolean;
  onChange?: (values: number[][]) => void;
  ariaLabel?: string;
  toneClassName?: string;
}): React.ReactElement {
  const updateCell = (r: number, c: number, raw: string) => {
    if (!onChange) return;
    const next = values.map((row) => [...row]);
    const parsed = Number.parseFloat(raw);
    next[r]![c] = Number.isFinite(parsed) ? parsed : 0;
    onChange(next);
  };
  return (
    <div
      role="grid"
      aria-label={ariaLabel}
      data-rc-toy-grid
      className={cn(
        "inline-flex flex-col gap-0.5 rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg) p-1",
        toneClassName,
      )}
    >
      {values.map((row, r) => (
        <div key={r} role="row" className="flex gap-0.5">
          {row.map((cell, c) =>
            editable ? (
              <input
                key={c}
                role="gridcell"
                type="number"
                step="any"
                value={Number.isFinite(cell) ? cell : 0}
                onChange={(e) => updateCell(r, c, e.target.value)}
                className={cn(
                  "w-12 rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg)",
                  "px-1 py-0.5 font-(--font-rc-mono) text-(--text-rc-xs) text-center",
                  "focus:outline-none focus:border-(--color-rc-accent)",
                )}
                aria-label={`row ${r + 1} col ${c + 1}`}
              />
            ) : (
              <span
                key={c}
                role="gridcell"
                className="inline-flex h-6 w-12 items-center justify-center font-(--font-rc-mono) text-(--text-rc-xs) text-(--color-rc-text)"
              >
                {Number.isFinite(cell) ? cell : "—"}
              </span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

export function ToyExamplePanel({
  inputMatrix,
  expectedShape,
  expectedSum,
  onCompute,
  showExpectedOnFail = true,
  className,
}: ToyExampleProps) {
  const [input, setInput] = React.useState<number[][]>(inputMatrix.values);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ToyExampleResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleCompute = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await onCompute(input);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Computation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Toy example"
      className={cn("flex flex-col gap-3", className)}
      data-rc-toy-example
    >
      <div className="flex flex-col gap-1.5">
        <div className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          {inputMatrix.label || "Input"}
        </div>
        <MatrixGrid
          values={input}
          editable={inputMatrix.editable ?? false}
          onChange={setInput}
          ariaLabel="toy input"
        />
      </div>

      {expectedShape ? (
        <p className="text-(--text-rc-xs) text-(--color-rc-text-muted)">
          Expected output shape:{" "}
          <span className="font-(--font-rc-mono)">
            [{expectedShape.join(", ")}]
          </span>
        </p>
      ) : null}
      {expectedSum !== undefined ? (
        <p className="text-(--text-rc-xs) text-(--color-rc-text-muted)">
          Sanity check: output sum should be{" "}
          <span className="font-(--font-rc-mono)">{expectedSum}</span>
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleCompute()}
        disabled={busy}
        className={cn(
          "self-start inline-flex items-center gap-2 rounded-(--radius-rc-md) border border-(--color-rc-border)",
          "px-3 py-1.5 text-(--text-rc-sm) text-(--color-rc-text)",
          "hover:bg-(--color-rc-surface-muted)",
          "disabled:opacity-60",
        )}
        data-rc-toy-compute
      >
        <Play
          size={14}
          aria-hidden
          className="text-(--color-rc-icon-accent)"
        />
        {busy ? "Computing…" : "Compute"}
      </button>

      {error ? (
        <p
          className="text-(--text-rc-xs) text-(--color-rc-danger)"
          data-rc-toy-error
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <div
          className="flex flex-col gap-2"
          data-rc-toy-result
          data-matches={result.matches ? "true" : "false"}
        >
          <div className="flex items-center gap-2 text-(--text-rc-sm)">
            {result.matches ? (
              <span className="inline-flex items-center gap-1 text-(--color-rc-icon-accent)">
                <CheckCircle2 size={14} aria-hidden /> Matches
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-(--color-rc-danger)">
                <XCircle size={14} aria-hidden /> Outputs disagree
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex flex-col gap-1">
              <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
                Your output
              </span>
              <MatrixGrid
                values={result.output}
                ariaLabel="your output"
                toneClassName={
                  result.matches
                    ? "border-(--color-rc-icon-accent)"
                    : "border-(--color-rc-danger)"
                }
              />
            </div>
            {!result.matches &&
            showExpectedOnFail &&
            result.expected !== undefined ? (
              <div className="flex flex-col gap-1" data-rc-toy-expected>
                <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
                  Expected
                </span>
                <MatrixGrid
                  values={result.expected}
                  ariaLabel="expected output"
                  toneClassName="border-(--color-rc-icon-accent)"
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
