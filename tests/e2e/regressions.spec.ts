import { expect, test } from "@playwright/test";

/**
 * Direct-navigation regression tests for the routes that previously emitted
 * 500s due to Server / Client component boundary errors.
 */
test.describe("route regressions", () => {
  test("/packages/flash-attention loads without a React error overlay", async ({
    page,
  }) => {
    const response = await page.goto("/packages/flash-attention");
    // Either the package exists (200) or the seeded catalog uses a different
    // flagship slug and we get a 404 — both are acceptable. What's NOT
    // acceptable is a 500 or a hydration-error overlay.
    expect(response?.status() ?? 0).toBeLessThan(500);

    await expect(page.locator("text=Application error")).toHaveCount(0);
    await expect(
      page.locator('[data-nextjs-dialog-overlay="true"]'),
    ).toHaveCount(0);
  });

  test("/enrollments/enr-1/stages/S2-tile renders gracefully", async ({
    page,
  }) => {
    const response = await page.goto("/enrollments/enr-1/stages/S2-tile");
    // The seeded enrollment may or may not exist depending on the data
    // source-of-truth workstream's seed pass. Acceptable outcomes:
    //   - 200 with a stage player.
    //   - 404 (notFound() is the correct path when enrollment is missing).
    // Unacceptable: 500 / unhandled exception.
    const status = response?.status() ?? 0;
    expect(status).toBeLessThan(500);

    await expect(page.locator("text=Application error")).toHaveCount(0);
    await expect(
      page.locator('[data-nextjs-dialog-overlay="true"]'),
    ).toHaveCount(0);
  });
});
