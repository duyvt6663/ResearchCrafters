"use client";

import * as React from "react";
import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { cn } from "../lib/cn.js";
import { renderMixedInline } from "../lib/math.js";

/**
 * ShapeTableEditor — editable table for tensor dim names, sizes, parameter
 * counts, and memory-layout reasoning notes.
 *
 * Workbench surface — restraint applies. Validation chips on each row are
 * either "passed", "wrong", "pending" — they NEVER reveal the canonical
 * shape values; learners debug by comparing against rubric and toy example,
 * not against a leaked answer column.
 *
 * Notes column supports inline math: any `$...$` segment is rendered via
 * KaTeX (server-safe via `react-katex`'s `InlineMath`).
 */
export interface ShapeRow {
  /** Row name e.g. "input", "conv1.weight". */
  name: string;
  /** Read-only dim labels e.g. ["B", "H", "W", "C"]. */
  dims: ReadonlyArray<string>;
  /**
   * Editable per-cell values. Length is expected to match `dims.length`,
   * but the editor tolerates mismatches by rendering empty cells for the
   * missing positions.
   */
  values: ReadonlyArray<string>;
  paramCount?: string;
  notes?: string;
}

export type ShapeRowValidation = "passed" | "wrong" | "pending";

export interface ShapeTableEditorProps {
  rows: ReadonlyArray<ShapeRow>;
  onChange: (rows: ShapeRow[]) => void;
  /** Per-row validation, keyed by `row.name`. */
  validation?: Record<string, ShapeRowValidation>;
  className?: string;
}

const VALIDATION_PILL: Record<
  ShapeRowValidation,
  {
    icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
    tone: string;
    label: string;
  }
> = {
  passed: {
    icon: CheckCircle2,
    tone: "text-(--color-rc-icon-accent)",
    label: "Passed",
  },
  wrong: { icon: XCircle, tone: "text-(--color-rc-danger)", label: "Wrong" },
  pending: {
    icon: CircleAlert,
    tone: "text-(--color-rc-text-subtle)",
    label: "Pending",
  },
};

export function ShapeTableEditor({
  rows,
  onChange,
  validation,
  className,
}: ShapeTableEditorProps) {
  const updateCell = (rowIdx: number, dimIdx: number, value: string) => {
    const next = rows.map((r, i) => {
      if (i !== rowIdx) return r;
      const values = [...r.values];
      values[dimIdx] = value;
      return { ...r, values };
    });
    onChange(next);
  };

  const updateParam = (rowIdx: number, value: string) => {
    onChange(
      rows.map((r, i) => (i === rowIdx ? { ...r, paramCount: value } : r)),
    );
  };

  const updateNotes = (rowIdx: number, value: string) => {
    onChange(rows.map((r, i) => (i === rowIdx ? { ...r, notes: value } : r)));
  };

  // Largest dim count across rows — used to size header columns.
  const maxDims = rows.reduce((max, r) => Math.max(max, r.dims.length), 0);
  const headerDims: string[] = [];
  for (let i = 0; i < maxDims; i++) {
    const found = rows.find((r) => r.dims[i] !== undefined)?.dims[i] ?? `d${i + 1}`;
    headerDims.push(found);
  }

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-(--radius-rc-md) border border-(--color-rc-border)",
        className,
      )}
      data-rc-shape-table
    >
      <table className="w-full text-left text-(--text-rc-sm)">
        <thead className="bg-(--color-rc-surface-muted) text-(--color-rc-text-muted)">
          <tr>
            <th className="px-3 py-2 font-medium">Tensor</th>
            {headerDims.map((d, idx) => (
              <th
                key={`dim-${idx}`}
                className="px-2 py-2 font-(--font-rc-mono) text-[11px] uppercase tracking-[0.08em]"
              >
                {d}
              </th>
            ))}
            <th className="px-2 py-2 font-medium">Params</th>
            <th className="px-2 py-2 font-medium">Notes</th>
            <th className="px-2 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            const v = validation?.[row.name] ?? "pending";
            const Pill = VALIDATION_PILL[v];
            return (
              <tr
                key={row.name}
                className="border-t border-(--color-rc-border)"
                data-rc-shape-row={row.name}
              >
                <td className="px-3 py-2 font-(--font-rc-mono) text-(--text-rc-sm) text-(--color-rc-text)">
                  {row.name}
                </td>
                {headerDims.map((_, dimIdx) => (
                  <td key={dimIdx} className="px-2 py-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={row.values[dimIdx] ?? ""}
                      onChange={(e) =>
                        updateCell(rowIdx, dimIdx, e.target.value)
                      }
                      aria-label={`${row.name} dim ${headerDims[dimIdx]}`}
                      className={cn(
                        "w-16 rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg)",
                        "px-1.5 py-1 font-(--font-rc-mono) text-(--text-rc-sm) text-center",
                        "focus:outline-none focus:border-(--color-rc-accent)",
                      )}
                      data-rc-shape-cell
                    />
                  </td>
                ))}
                <td className="px-2 py-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.paramCount ?? ""}
                    onChange={(e) => updateParam(rowIdx, e.target.value)}
                    aria-label={`${row.name} param count`}
                    className={cn(
                      "w-24 rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg)",
                      "px-1.5 py-1 font-(--font-rc-mono) text-(--text-rc-sm) text-right",
                      "focus:outline-none focus:border-(--color-rc-accent)",
                    )}
                  />
                </td>
                <td className="px-2 py-1 align-top">
                  <textarea
                    rows={1}
                    value={row.notes ?? ""}
                    onChange={(e) => updateNotes(rowIdx, e.target.value)}
                    aria-label={`${row.name} notes`}
                    placeholder="e.g. row-major; $O(BHWC)$ memory"
                    className={cn(
                      "w-48 resize-none rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg)",
                      "px-1.5 py-1 text-(--text-rc-sm)",
                      "focus:outline-none focus:border-(--color-rc-accent)",
                    )}
                    data-rc-shape-notes
                  />
                  {row.notes ? (
                    <div
                      className="mt-1 text-(--text-rc-xs) text-(--color-rc-text-muted)"
                      data-rc-shape-notes-preview
                    >
                      {renderMixedInline(row.notes)}
                    </div>
                  ) : null}
                </td>
                <td className="px-2 py-1 align-middle">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-(--radius-rc-pill) border border-(--color-rc-border) px-2 py-0.5 text-(--text-rc-xs)",
                      Pill.tone,
                    )}
                    data-rc-shape-validation={v}
                    aria-label={Pill.label}
                    role="status"
                  >
                    <Pill.icon size={12} aria-hidden />
                    <span>{Pill.label}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
