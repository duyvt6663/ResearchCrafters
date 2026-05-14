"use client";

import * as React from "react";
import {
  DerivationStepList,
  type DerivationStep,
  type PaletteSpec,
} from "@researchcrafters/ui/components";
import { Prose } from "@researchcrafters/ui/components";

/**
 * M1 — Symbol Palette mock (post-promotion).
 *
 * Now a thin demo over the production `DerivationStepList` + `SymbolPalette`
 * primitives in `packages/ui` (see `SymbolPalette.tsx`). The mock keeps
 * existing here so the /experiments URL is a live, on-brand demo of the
 * integrated component, and so the writeup's "Findings" history stays
 * attached to a runnable artifact.
 */

const PALETTE: PaletteSpec = {
  categoryOrder: ["differentials", "variables", "operators", "numbers", "bonus"],
  categoryLabels: {
    differentials: "Differentials",
    variables: "Variables",
    operators: "Operators",
    numbers: "Numbers",
    bonus: "More symbols",
  },
  tiles: [
    {
      id: "dH-dx",
      label: "$\\frac{dH}{dx}$",
      latex: "\\frac{dH}{dx}",
      category: "differentials",
      gloss: {
        name: "Derivative of H w.r.t. x",
        plainEnglish:
          "How much H changes when x changes by a tiny amount. The slope of H seen as a function of x.",
        appearsIn: "artifact/logic/solution/algorithm.md",
      },
    },
    {
      id: "dF-dx",
      label: "$\\frac{dF}{dx}$",
      latex: "\\frac{dF}{dx}",
      category: "differentials",
      gloss: {
        name: "Derivative of F w.r.t. x",
        plainEnglish:
          "How much the learned residual F changes when x changes. This is the part the network has to actually optimise.",
        appearsIn: "artifact/logic/solution/algorithm.md",
      },
    },
    {
      id: "H",
      label: "$H$",
      latex: "H",
      category: "variables",
      gloss: {
        name: "H — the target mapping",
        plainEnglish:
          "The function a stack of layers ideally implements. The paper writes it H(x).",
        appearsIn: "artifact/logic/claims.md#identity-is-the-trick",
      },
    },
    {
      id: "F",
      label: "$F$",
      latex: "F",
      category: "variables",
      gloss: {
        name: "F — the residual mapping",
        plainEnglish:
          "What the stack of layers actually learns, on top of the identity shortcut.",
        appearsIn: "artifact/logic/claims.md#identity-is-the-trick",
      },
    },
    {
      id: "x",
      label: "$x$",
      latex: "x",
      category: "variables",
      gloss: {
        name: "x — the block input",
        plainEnglish: "The input fed into the residual block.",
      },
    },
    {
      id: "eq",
      label: "$=$",
      latex: " = ",
      category: "operators",
      gloss: {
        name: "Equals",
        plainEnglish: "The two sides are the same quantity.",
      },
    },
    {
      id: "plus",
      label: "$+$",
      latex: " + ",
      category: "operators",
      gloss: { name: "Plus", plainEnglish: "Add the two quantities together." },
    },
    {
      id: "minus",
      label: "$-$",
      latex: " - ",
      category: "operators",
      gloss: { name: "Minus", plainEnglish: "Subtract the second from the first." },
    },
    {
      id: "one",
      label: "$1$",
      latex: "1",
      category: "numbers",
      gloss: {
        name: "The number 1",
        plainEnglish:
          "Appears as the derivative of the identity shortcut: d(x)/dx = 1. It's why deep residual stacks preserve gradient signal.",
        appearsIn: "artifact/logic/claims.md#identity-is-the-trick",
      },
    },
    {
      id: "zero",
      label: "$0$",
      latex: "0",
      category: "numbers",
      gloss: {
        name: "The number 0",
        plainEnglish:
          "Useful when expressing the identity case: if F = 0, then H = x.",
      },
    },
    {
      id: "partial",
      label: "$\\partial$",
      latex: "\\partial",
      category: "bonus",
      gloss: {
        name: "Partial derivative",
        plainEnglish:
          "Like d/dx, but used when the function has many inputs and you want the slope along just one axis.",
      },
    },
    {
      id: "nabla",
      label: "$\\nabla$",
      latex: "\\nabla",
      category: "bonus",
      gloss: {
        name: "Gradient",
        plainEnglish:
          "The vector of partial derivatives — points in the direction the function increases fastest.",
      },
    },
    {
      id: "sum",
      label: "$\\sum$",
      latex: "\\sum",
      category: "bonus",
      gloss: {
        name: "Sum",
        plainEnglish:
          "Add up a bunch of terms indexed by something — typical for losses over a batch.",
      },
    },
  ],
};

const TARGET_LATEX = "\\frac{dH}{dx} = \\frac{dF}{dx} + 1";

export function Mock(): React.ReactElement {
  const [value, setValue] = React.useState("");
  const [showTarget, setShowTarget] = React.useState(false);

  const steps: DerivationStep[] = [
    {
      id: "given-H",
      kind: "given",
      label: "Given · the residual reformulation",
      expressionLatex: "H(x) = F(x) + x",
    },
    {
      id: "blank-derivative",
      kind: "blank",
      label: "Step 02 · differentiate w.r.t. x",
      inputMode: "palette",
      palette: PALETTE,
      value,
      onChange: setValue,
      hint: "What is the derivative of x with respect to x? Add it to the F derivative.",
    },
  ];

  return (
    <div
      className="flex flex-col gap-5 rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-5"
      data-rc-experiment="m1-symbol-palette"
    >
      <header className="flex flex-col gap-1.5">
        <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          Stage S001M · live demo of <code className="font-(--font-rc-mono)">DerivationStepList</code> in <code className="font-(--font-rc-mono)">inputMode=&quot;palette&quot;</code>
        </span>
        <h3 className="text-(--text-rc-lg) font-semibold text-(--color-rc-text)">
          Differentiate <Prose inline>{`$H(x) = F(x) + x$`}</Prose> with respect to <Prose inline>{`$x$`}</Prose>.
        </h3>
      </header>

      <DerivationStepList steps={steps} showValidation={false} />

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowTarget((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-(--radius-rc-sm) border border-(--color-rc-border) px-2 py-1 text-(--text-rc-xs) text-(--color-rc-text-muted) hover:bg-(--color-rc-surface-muted)"
        >
          {showTarget ? "Hide target" : "Show target"}
        </button>
        {showTarget ? (
          <div className="text-(--text-rc-sm) text-(--color-rc-text-muted)">
            Target: <Prose inline>{`$${TARGET_LATEX}$`}</Prose>
          </div>
        ) : null}
      </div>
    </div>
  );
}
