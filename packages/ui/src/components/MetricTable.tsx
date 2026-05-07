import * as React from "react";
import { cn } from "../lib/cn.js";

/**
 * MetricTable — compact monospaced table of run / experiment metrics.
 *
 * Use stable column widths and right-align numeric columns so consecutive
 * runs are easy to scan (per `docs/FRONTEND.md` section 4 layout principles).
 */
export interface MetricTableColumn<Row> {
  id: string;
  header: string;
  /** Render cell value. */
  cell: (row: Row) => React.ReactNode;
  align?: "left" | "right";
  /** Optional fixed width hint, e.g. "8ch". */
  width?: string;
}

export interface MetricTableProps<Row> {
  columns: MetricTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  caption?: string;
  className?: string;
}

export function MetricTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  className,
}: MetricTableProps<Row>) {
  return (
    <div
      className={cn(
        "overflow-auto rounded-(--radius-rc-sm) border border-(--color-rc-border)",
        className,
      )}
    >
      <table className="w-full border-collapse font-(--font-rc-mono) text-(--text-rc-xs)">
        {caption ? (
          <caption className="text-left text-(--text-rc-sm) text-(--color-rc-text-muted) py-1.5 px-2">
            {caption}
          </caption>
        ) : null}
        <thead className="bg-(--color-rc-surface)">
          <tr>
            {columns.map((c) => (
              <th
                key={c.id}
                scope="col"
                className={cn(
                  "px-2 py-1 text-(--text-rc-xs) font-medium text-(--color-rc-text-muted) border-b border-(--color-rc-border)",
                  c.align === "right" ? "text-right" : "text-left",
                )}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className="border-b border-(--color-rc-border) last:border-b-0"
            >
              {columns.map((c) => (
                <td
                  key={c.id}
                  className={cn(
                    "px-2 py-1 text-(--color-rc-text)",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
