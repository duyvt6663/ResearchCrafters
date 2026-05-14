"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import { renderInlineMath } from "../lib/math.js";
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from "./Tooltip.js";

/**
 * SymbolPalette — click-to-assemble math editor.
 *
 * Promoted from `apps/web/experiments/m1-symbol-palette/` after the M1
 * symbol-palette proposal validated (see that folder's writeup for goal,
 * hypothesis, and validation criteria).
 *
 * The palette renders a grouped grid of tiles. Clicking a tile appends a
 * chip to the slot. Clipped chips concatenate to a LaTeX string emitted
 * via `onChange` — so callers continue to treat the value as plain LaTeX,
 * exactly like the text-mode input does today.
 *
 * State model: chip array is INTERNAL. The component is "value-out" with
 * respect to LaTeX (parent only sees the composed string). Chips reset on
 * remount; this is the documented v1 tradeoff (the W2 follow-up adds chip
 * round-tripping when we extend persistence). When `value` arrives as a
 * non-empty initial string (rehydration case) it is shown as a single
 * editable literal chip that the learner can clear and start fresh.
 *
 * Accessibility: every tile is a focusable `<button>`. The chip row is a
 * keyboard-reachable list of buttons that remove on click. Tooltips use
 * Radix and respect keyboard focus.
 */

export interface PaletteTile {
  /** Stable identifier within the palette (used as React key + analytics tag). */
  id: string;
  /** Visible label on the tile. May contain a `$...$` math segment (rendered
   *  via inline KaTeX through `renderInlineMath`) or plain text. */
  label: string;
  /** LaTeX fragment inserted into the slot when this tile is picked. May
   *  include leading/trailing spaces — operators typically pad themselves. */
  latex: string;
  /** Category group. Order is controlled by `PaletteSpec.categoryOrder`. */
  category: string;
  /** Optional plain-English gloss shown in a tooltip on hover/focus. */
  gloss?: {
    name: string;
    plainEnglish: string;
    /** Optional pointer back to an artifact section where this symbol appears.
     *  Real impl deep-links these; for now they render as inert text. */
    appearsIn?: string;
  };
}

export interface PaletteSpec {
  tiles: ReadonlyArray<PaletteTile>;
  /** Display order of category groups; categories not listed sort last in
   *  insertion order. Defaults to the natural insertion order of `tiles`. */
  categoryOrder?: ReadonlyArray<string>;
  /** Optional pretty labels per category. Defaults to the category id. */
  categoryLabels?: Readonly<Record<string, string>>;
}

export interface SymbolPaletteProps {
  spec: PaletteSpec;
  /** Initial LaTeX value. Empty string on first mount means an empty slot. */
  value: string;
  onChange: (latex: string) => void;
  /** Optional bound on chip count (defensive; not exposed to authors). */
  maxChips?: number;
  className?: string;
}

interface Chip {
  uid: string;
  tileId: string | null;
  latex: string;
  /** Label to render on the chip. `null` `tileId` means it's a legacy literal
   *  reconstructed from an initial non-empty `value`. */
  label: string;
}

let chipCounter = 0;
const nextUid = (): string => `chip-${++chipCounter}`;

function categoriesFromSpec(spec: PaletteSpec): ReadonlyArray<string> {
  if (spec.categoryOrder && spec.categoryOrder.length > 0) {
    const cats = [...spec.categoryOrder];
    // Append any categories present in tiles but missing from the explicit
    // order so authors don't silently lose tiles.
    for (const t of spec.tiles) {
      if (!cats.includes(t.category)) cats.push(t.category);
    }
    return cats;
  }
  const seen: string[] = [];
  for (const t of spec.tiles) {
    if (!seen.includes(t.category)) seen.push(t.category);
  }
  return seen;
}

function renderTileLabel(label: string): React.ReactNode {
  // If the label is wrapped in `$...$`, render as inline math; otherwise
  // render plain text. Keeps tile labels expressive without forcing every
  // author to ship math.
  const m = label.match(/^\$(.+)\$$/);
  if (m && m[1]) return renderInlineMath(m[1]);
  return <span>{label}</span>;
}

export function SymbolPalette({
  spec,
  value,
  onChange,
  maxChips = 64,
  className,
}: SymbolPaletteProps): React.ReactElement {
  const initialChips = React.useMemo<ReadonlyArray<Chip>>(() => {
    if (!value) return [];
    return [
      {
        uid: nextUid(),
        tileId: null,
        latex: value,
        label: value,
      },
    ];
    // The component is uncontrolled w.r.t. chip array — we initialize from
    // `value` once and from then on the parent's `value` flows from
    // chip → LaTeX, not the other way. Documented in the JSDoc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [chips, setChips] = React.useState<ReadonlyArray<Chip>>(initialChips);

  const composed = chips.map((c) => c.latex).join("");
  const lastEmitted = React.useRef<string>(composed);
  React.useEffect(() => {
    if (lastEmitted.current !== composed) {
      lastEmitted.current = composed;
      onChange(composed);
    }
  }, [composed, onChange]);

  const addTile = (tile: PaletteTile) => {
    if (chips.length >= maxChips) return;
    setChips((prev) => [
      ...prev,
      { uid: nextUid(), tileId: tile.id, latex: tile.latex, label: tile.label },
    ]);
  };
  const removeChip = (uid: string) =>
    setChips((prev) => prev.filter((c) => c.uid !== uid));
  const clearAll = () => setChips([]);

  const categories = categoriesFromSpec(spec);
  const tilesByCategory: Record<string, ReadonlyArray<PaletteTile>> = {};
  for (const cat of categories) {
    tilesByCategory[cat] = spec.tiles.filter((t) => t.category === cat);
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn("flex flex-col gap-3", className)}
        data-rc-symbol-palette
      >
        {/* Slot — ordered chip row. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
              Your expression
            </span>
            <button
              type="button"
              onClick={clearAll}
              disabled={chips.length === 0}
              className="inline-flex items-center gap-1 rounded-(--radius-rc-sm) border border-(--color-rc-border) px-2 py-1 text-(--text-rc-xs) text-(--color-rc-text-muted) hover:bg-(--color-rc-surface-muted) disabled:opacity-50"
              data-rc-symbol-palette-clear
            >
              Clear
            </button>
          </div>
          <div
            className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-(--radius-rc-sm) border border-dashed border-(--color-rc-border) bg-(--color-rc-surface) px-2 py-2"
            data-rc-symbol-palette-slot
            aria-label="Assembled expression"
          >
            {chips.length === 0 ? (
              <span className="text-(--text-rc-sm) text-(--color-rc-text-subtle)">
                (empty — click a tile below)
              </span>
            ) : (
              chips.map((chip) => (
                <button
                  key={chip.uid}
                  type="button"
                  onClick={() => removeChip(chip.uid)}
                  className="group inline-flex items-center gap-1 rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg) px-2 py-1 text-(--color-rc-text) hover:border-(--color-rc-danger) hover:text-(--color-rc-danger)"
                  aria-label={`Remove ${chip.tileId ?? "literal"} chip`}
                  data-rc-symbol-palette-chip
                  data-tile-id={chip.tileId ?? "literal"}
                >
                  {renderTileLabel(chip.label)}
                  <span aria-hidden className="opacity-50 group-hover:opacity-100">
                    ×
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Palette — grouped tile grid. */}
        <div className="flex flex-col gap-2.5">
          <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
            Palette · hover any tile to see what it means
          </span>
          {categories.map((cat) => {
            const tiles = tilesByCategory[cat] ?? [];
            if (tiles.length === 0) return null;
            const label = spec.categoryLabels?.[cat] ?? cat;
            return (
              <div
                key={cat}
                className="flex flex-col gap-1.5"
                data-rc-symbol-palette-group={cat}
              >
                <span className="text-(--text-rc-xs) text-(--color-rc-text-subtle)">
                  {label}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {tiles.map((tile) => {
                    const button = (
                      <button
                        type="button"
                        onClick={() => addTile(tile)}
                        className="inline-flex min-w-[42px] items-center justify-center gap-1 rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg) px-2.5 py-1.5 text-(--color-rc-text) hover:border-(--color-rc-accent) focus:border-(--color-rc-accent) focus:outline-none"
                        aria-label={tile.gloss?.name ?? `Add ${tile.id}`}
                        data-rc-symbol-palette-tile={tile.id}
                      >
                        {renderTileLabel(tile.label)}
                      </button>
                    );
                    if (!tile.gloss) return <React.Fragment key={tile.id}>{button}</React.Fragment>;
                    return (
                      <TooltipRoot key={tile.id}>
                        <TooltipTrigger asChild>{button}</TooltipTrigger>
                        <TooltipContent>
                          <div className="flex max-w-[260px] flex-col gap-1">
                            <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] opacity-80">
                              {tile.gloss.name}
                            </span>
                            <span className="text-(--text-rc-sm) leading-snug">
                              {tile.gloss.plainEnglish}
                            </span>
                            {tile.gloss.appearsIn ? (
                              <span className="text-(--text-rc-xs) opacity-70">
                                appears in {tile.gloss.appearsIn}
                              </span>
                            ) : null}
                          </div>
                        </TooltipContent>
                      </TooltipRoot>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
