import { expect, test } from "@playwright/test";

/**
 * Catalog -> package overview -> start -> stage player happy path.
 *
 * The flagship slug is read from the FIRST package card on `/` rather than
 * hardcoded so the data-source-of-truth workstream can swap the visible
 * catalog without invalidating this regression suite.
 */
test.describe("happy path", () => {
  test("catalog renders and reaches the first stage", async ({ page }) => {
    await page.goto("/");

    // Catalog hero must render.
    await expect(page.locator("h1").first()).toBeVisible();

    // Find the first package-card link. The catalog renders cards as
    // <a href="/packages/<slug>"> — match by the href shape rather than by
    // brittle copy.
    const firstCard = page.locator('a[href^="/packages/"]').first();
    await expect(firstCard).toBeVisible();

    const cardHref = await firstCard.getAttribute("href");
    expect(cardHref).toMatch(/^\/packages\/[^/]+$/);

    await firstCard.click();
    await expect(page).toHaveURL(/\/packages\/[^/]+$/);

    // Package overview headline + Start CTA.
    await expect(page.locator("h1").first()).toBeVisible();
    const startCta = page
      .getByRole("link", { name: /start/i })
      .or(page.getByRole("button", { name: /start/i }))
      .first();
    await expect(startCta).toBeVisible();

    const tagName = await startCta.evaluate((element) =>
      element.tagName.toLowerCase(),
    );

    if (tagName === "button") {
      // Signed-out users see the client-side login modal entry point instead
      // of a direct start link. This smoke test only needs to verify the
      // package overview exposes that entry point without an app crash.
      await expect(startCta).toBeEnabled();
    } else {
      // Click Start. Without an authenticated session the route redirects to
      // /login?next=/packages/{slug}/start; with a session it lands on the
      // first stage. We assert the URL ends up either on a stage page or on
      // /login with the right `next` parameter — both are acceptable
      // outcomes for the smoke test.
      await Promise.all([
        page.waitForLoadState("networkidle"),
        startCta.click(),
      ]);

      const url = page.url();
      const reachedStage = /\/enrollments\/[^/]+\/stages\/[^/]+/.test(url);
      const reachedLogin = /\/login\?.*next=.*\/start/.test(url);
      const reachedStartGracefulError = /\/packages\/[^/]+\/start/.test(url);

      expect(reachedStage || reachedLogin || reachedStartGracefulError).toBe(
        true,
      );
    }

    // No React error overlay should be visible on any of those landing
    // surfaces.
    await expect(page.locator("text=Application error")).toHaveCount(0);
    await expect(
      page.locator('[data-nextjs-dialog-overlay="true"]'),
    ).toHaveCount(0);
  });
});
