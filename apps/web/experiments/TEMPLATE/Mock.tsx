"use client";

import * as React from "react";

/**
 * Mock template. Replace the body with your proposal's interaction. Keep the
 * file under ~250 lines — if it grows past that, the mock is doing too much
 * and the writeup is doing too little.
 *
 * Conventions:
 *  - Use `@researchcrafters/ui/components` for shared primitives (Tooltip,
 *    Prose, Card, Button, etc.) so the mock visually matches the real app.
 *  - Use the `--color-rc-*` / `--text-rc-*` design tokens (defined in
 *    `packages/ui/src/styles.css`) so dark/light mode work out of the box.
 *  - Do NOT add new dependencies for a mock. If your idea needs a new dep,
 *    stub the dep's role with native React + note it in the writeup under
 *    "Integration sketch".
 *  - Do NOT call the real API, grader, or mentor — stub locally. The mock
 *    proves *interaction*, not wiring.
 */
export function Mock(): React.ReactElement {
  return (
    <div className="rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-6">
      <p className="text-(--text-rc-sm) text-(--color-rc-text-muted)">
        Replace this file's body with your mock. See the writeup for the
        proposal's hypothesis and manual test script.
      </p>
    </div>
  );
}
