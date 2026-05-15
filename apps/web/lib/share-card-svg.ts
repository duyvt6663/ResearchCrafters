// Pure share-card SVG renderer. Image asset returned on publish.
//
// The renderer takes a `ShareCardPayload` snapshot and emits a self-contained
// SVG. No external assets, no fonts beyond system stacks — the asset must
// render the same in a browser, social-card crawler, and a screenshot test.
//
// Real PNG rendering is still tracked under the worker TODO; for the MVP
// share flow the SVG is the canonical image asset.

import type { ShareCardPayload } from "@researchcrafters/ui/components";

const WIDTH = 1200;
const HEIGHT = 630;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length <= maxChars) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current.length > 0) lines.push(current);
  if (lines.length === maxLines && current.length > 0) {
    const last = lines[maxLines - 1] ?? "";
    if (!last.endsWith(current)) {
      const truncated =
        last.length + 1 >= maxChars
          ? `${last.slice(0, Math.max(0, maxChars - 1))}…`
          : `${last}…`;
      lines[maxLines - 1] = truncated;
    }
  }
  return lines;
}

function deriveScoreString(
  raw: ShareCardPayload["scoreSummary"],
): string | null {
  if (raw === undefined) return null;
  if (typeof raw === "string") return raw;
  return `${raw.passed}/${raw.total}`;
}

export function renderShareCardSvg(payload: ShareCardPayload): string {
  const title = payload.packageSlug ?? "Run summary";
  const score = deriveScoreString(payload.scoreSummary);
  const insight = payload.learnerInsight?.trim() ?? "";
  const insightLines = insight ? wrapLines(insight, 56, 4) : [];
  const cohort =
    payload.cohortPercentage == null
      ? null
      : `${Math.round(payload.cohortPercentage)}%`;
  const branch = payload.selectedBranchType ?? null;

  const insightSvg = insightLines
    .map(
      (line, idx) =>
        `<tspan x="80" dy="${idx === 0 ? 0 : 44}">${escapeXml(line)}</tspan>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${escapeXml(title)} share card">
  <rect width="100%" height="100%" fill="#0b1020"/>
  <rect x="40" y="40" width="${WIDTH - 80}" height="${HEIGHT - 80}" rx="24" ry="24" fill="#111a35" stroke="#1f2a4d" stroke-width="2"/>
  <text x="80" y="120" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="28" fill="#94a3b8" font-weight="500">ResearchCrafters · ${escapeXml(title)}</text>
  <text x="80" y="200" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="56" fill="#e2e8f0" font-weight="700">${escapeXml(score ?? "Run summary")}</text>
  ${branch ? `<text x="80" y="260" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="24" fill="#a5b4fc">Branch: ${escapeXml(branch)}</text>` : ""}
  ${cohort ? `<text x="80" y="300" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="24" fill="#a5b4fc">Cohort: ${escapeXml(cohort)}</text>` : ""}
  ${
    insightLines.length > 0
      ? `<text x="80" y="380" font-family="Georgia, serif" font-size="36" fill="#f8fafc" font-style="italic">${insightSvg}</text>`
      : ""
  }
  <text x="80" y="${HEIGHT - 80}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="20" fill="#64748b">researchcrafters.example</text>
</svg>
`;
}

export const SHARE_CARD_IMAGE_WIDTH = WIDTH;
export const SHARE_CARD_IMAGE_HEIGHT = HEIGHT;
