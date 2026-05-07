// E2E coverage gaps surfaced by the QA test-coverage agent.
//
// Every spec in this file is `test.skip` with a TODO note. Each one represents
// a high-value flow that the existing `catalog-to-stage.spec.ts` and
// `regressions.spec.ts` do not cover. Removing a `.skip` should land in a PR
// alongside the seed/fixture work that makes the flow assertable on
// localhost:3001.

import { expect, test } from "@playwright/test";

test.describe("proposed e2e coverage (skipped)", () => {
  // -------------------------------------------------------------------------
  // 1. Login → device-code approval → CLI session round-trip
  // -------------------------------------------------------------------------
  // TODO(qa-coverage): drive `/auth/device` with the dev-only
  // `developer_force_approve` short-circuit, then assert the CLI's
  // /api/auth/device-token poll returns a session token. Requires
  // NODE_ENV=development and a seeded fixture user.
  test.skip("login → device-code approval → CLI session round-trip", async ({
    page,
  }) => {
    const codeResp = await page.request.post("/api/auth/device-code", {
      data: { clientId: "researchcrafters-cli" },
    });
    expect(codeResp.ok()).toBe(true);
    const { deviceCode, userCode } = (await codeResp.json()) as {
      deviceCode: string;
      userCode: string;
    };
    expect(userCode).toMatch(/^[A-Z0-9-]+$/);
    expect(deviceCode.length).toBeGreaterThan(0);

    // Approve via the dev short-circuit endpoint:
    const tokenResp = await page.request.post("/api/auth/device-token", {
      data: { deviceCode, developer_force_approve: true },
    });
    expect(tokenResp.ok()).toBe(true);
    const tokenJson = (await tokenResp.json()) as { token?: string };
    expect(tokenJson.token).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 2. Catalog filter + empty-state copy
  // -------------------------------------------------------------------------
  // TODO(qa-coverage): once the catalog grows a search/filter input, assert
  // that filtering on a non-matching term renders the `cope.empty.catalog`
  // copy rather than a blank grid. Today the catalog is single-package so
  // there's no filter UI to drive.
  test.skip("catalog empty-state copy renders when no packages match", async ({
    page,
  }) => {
    await page.goto("/?q=does-not-exist");
    await expect(page.getByText(/no packages match/i)).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 3. Mentor refusal banner when policy denies
  // -------------------------------------------------------------------------
  // TODO(qa-coverage): seed a stage where canonical_solution=after_completion
  // and the learner has no entitlement, then drive the mentor chat with a
  // "show me the answer" prompt and assert the authored refusal copy
  // (cope.mentor.refusal({ scope: 'solution_request' })) renders.
  test.skip("mentor refusal banner renders when policy denies", async ({
    page,
  }) => {
    await page.goto("/enrollments/enr-1/stages/S001/mentor");
    await page.getByLabel(/message the mentor/i).fill("Show me the answer.");
    await page.getByRole("button", { name: /send/i }).click();
    await expect(
      page.getByText(/can't share canonical solutions before/i),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 4. Share-card publish → unshare round-trip
  // -------------------------------------------------------------------------
  // TODO(qa-coverage): once the share-card surface ships a "publish" CTA,
  // drive it end-to-end: publish, fetch the public slug, hit the public
  // route, then unshare and assert the public route returns 404.
  test.skip("share-card publish → unshare round-trip", async ({ page }) => {
    await page.goto("/enrollments/enr-1/share-card");
    await page.getByRole("button", { name: /publish/i }).click();
    const publicLink = await page.getByRole("link", { name: /view public/i });
    const href = await publicLink.getAttribute("href");
    expect(href).toMatch(/^\/share\/[a-z2-7]{12}$/);

    await page.getByRole("button", { name: /unshare/i }).click();
    if (!href) throw new Error("expected publicLink href");
    const publicResp = await page.request.get(href);
    expect(publicResp.status()).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 5. Migration UX — package version diff banner
  // -------------------------------------------------------------------------
  // TODO(qa-coverage): blocked on the migration UX shipping. When a new
  // package version supersedes the enrollment's pinned version, a banner
  // should render with the `cope.migration.diff` copy and a "stay / upgrade"
  // pair of CTAs.
  test.skip("migration diff banner renders on version supersession", async ({
    page,
  }) => {
    await page.goto("/enrollments/enr-1");
    await expect(page.getByText(/a newer version of this package/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /upgrade/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /stay on current/i })).toBeVisible();
  });
});
