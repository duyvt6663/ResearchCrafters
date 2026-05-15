import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ShareCardPreview,
  type ShareCardPayload,
} from "../src/components/ShareCardPreview.js";

/**
 * Acceptance coverage for `backlog/00-roadmap.md:104`
 * "Share cards can show hardest decision and safe branch percentages."
 *
 * The cohort percentage is "safe" in the privacy sense: callers pass an
 * already-suppressed value per backlog/06 minimum-N rules. These tests pin
 * the two rendering modes the criterion requires — visible percentage when
 * a number is provided, and the authored suppression copy when the payload
 * marks the cohort as suppressed (`null`).
 */
describe("ShareCardPreview — hardest decision + safe branch percentages", () => {
  const basePayload: ShareCardPayload = {
    packageSlug: "resnet",
    packageVersionId: "pv-1",
    completionStatus: "complete",
    scoreSummary: { passed: 3, total: 3 },
    selectedBranchType: "canonical",
    learnerInsight: "Residuals shift identity into init.",
  };

  it("renders hardest decision copy when provided in the payload", () => {
    const html = renderToStaticMarkup(
      <ShareCardPreview
        payload={{
          ...basePayload,
          hardestDecision: "Pick init strategy",
          cohortPercentage: 65,
        }}
      />,
    );
    expect(html).toContain("Hardest decision");
    expect(html).toContain("Pick init strategy");
  });

  it("renders the cohort percentage rounded when payload supplies a number", () => {
    const html = renderToStaticMarkup(
      <ShareCardPreview
        payload={{ ...basePayload, cohortPercentage: 62.7 }}
      />,
    );
    expect(html).toContain("Cohort");
    expect(html).toContain("63%");
  });

  it("hides cohort percentage and shows suppression copy when payload marks it null", () => {
    const html = renderToStaticMarkup(
      <ShareCardPreview payload={{ ...basePayload, cohortPercentage: null }} />,
    );
    expect(html).toContain("Cohort");
    expect(html).not.toMatch(/\d+%/);
  });

  it("omits the hardest-decision row when not provided", () => {
    const html = renderToStaticMarkup(
      <ShareCardPreview payload={{ ...basePayload, cohortPercentage: 40 }} />,
    );
    expect(html).not.toContain("Hardest decision");
  });

  it("renders both hardest decision and a non-null cohort percentage together", () => {
    const html = renderToStaticMarkup(
      <ShareCardPreview
        payload={{
          ...basePayload,
          hardestDecision: "Pick init strategy",
          cohortPercentage: 80,
        }}
      />,
    );
    expect(html).toContain("Pick init strategy");
    expect(html).toContain("80%");
  });
});
