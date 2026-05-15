/**
 * Web-only answer grader.
 *
 * Produces a deterministic structured grade for the web stage-attempt route.
 * Web stages don't run code, so we can't ask the runner for artifacts; this
 * grader scores the learner's prose against the authored rubric dimensions
 * using a small set of evidence-grounded heuristics:
 *
 *   - Length / completeness: word count vs a per-dimension floor.
 *   - Evidence grounding: presence of evidence markers
 *     (citations like `[1]`, `because`, `since`, quoted spans).
 *   - Structure: paragraph breaks and explicit list markers.
 *
 * The output mirrors the public shape of `Grade` in
 * `@researchcrafters/evaluator-sdk` (status / score / dimensions / feedback)
 * so the existing grade-detail UI keeps working when we eventually swap in
 * the LLM grader.
 */

export type WebGradeStatus = "passed" | "partial" | "failed";

export interface WebRubricDimension {
  id: string;
  label: string;
  weight: number;
}

export interface WebDimensionScore {
  id: string;
  label: string;
  score: number;
  weight: number;
  notes: string;
}

export interface WebGrade {
  status: WebGradeStatus;
  score: number;
  passThreshold: number;
  dimensions: WebDimensionScore[];
  feedback: string;
  wordCount: number;
}

export interface WebGradeInput {
  answer: unknown;
  rubric?: ReadonlyArray<WebRubricDimension>;
  /** Pass threshold in [0, 1]. Defaults to 0.6. */
  passThreshold?: number;
}

const DEFAULT_PASS_THRESHOLD = 0.6;
const TARGET_WORDS = 80;
const FLOOR_WORDS = 20;
const EVIDENCE_PATTERNS = [
  /\[[^\]]+\]/g,
  /\bbecause\b/gi,
  /\bsince\b/gi,
  /\btherefore\b/gi,
  /"[^"]{4,}"/g,
];

function extractText(answer: unknown): string {
  if (typeof answer === "string") return answer;
  if (answer && typeof answer === "object") {
    const obj = answer as Record<string, unknown>;
    if (typeof obj["text"] === "string") return obj["text"];
    if (typeof obj["draft"] === "string") return obj["draft"];
    if (typeof obj["value"] === "string") return obj["value"];
    if (typeof obj["latex"] === "string") return obj["latex"];
  }
  return "";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function lengthScore(words: number): number {
  if (words <= 0) return 0;
  if (words >= TARGET_WORDS) return 1;
  if (words <= FLOOR_WORDS) return words / FLOOR_WORDS / 2;
  return 0.5 + 0.5 * ((words - FLOOR_WORDS) / (TARGET_WORDS - FLOOR_WORDS));
}

function evidenceScore(text: string): number {
  let hits = 0;
  for (const pat of EVIDENCE_PATTERNS) {
    hits += (text.match(pat) ?? []).length;
  }
  return clamp01(hits / 3);
}

function structureScore(text: string): number {
  const paragraphs = text.split(/\n{2,}/u).filter((p) => p.trim().length > 0).length;
  const bullets = (text.match(/(^|\n)\s*([-*]|\d+\.)\s+/g) ?? []).length;
  const richness = paragraphs + Math.min(bullets, 3);
  return clamp01(richness / 4);
}

/**
 * Score a rubric dimension. The label is matched against a few well-known
 * concept buckets ("evidence", "clarity", "structure", "reasoning") so the
 * heuristic per-dimension score reflects the dimension's intent rather
 * than scoring every dimension identically.
 */
function scoreDimension(
  dim: WebRubricDimension,
  metrics: { length: number; evidence: number; structure: number },
): WebDimensionScore {
  const label = `${dim.id} ${dim.label}`.toLowerCase();
  let score: number;
  let notes: string;
  if (/(evidence|cite|ground|support|reference)/.test(label)) {
    score = clamp01(0.4 * metrics.length + 0.6 * metrics.evidence);
    notes = metrics.evidence > 0
      ? "Found evidence markers in the answer."
      : "No evidence markers detected — add a citation or quoted span.";
  } else if (/(clarity|writing|prose|exposition|polish)/.test(label)) {
    score = clamp01(0.6 * metrics.length + 0.4 * metrics.structure);
    notes =
      metrics.length >= 0.8
        ? "Answer length supports a clear exposition."
        : "Expand the answer to support a clearer exposition.";
  } else if (/(structure|organi[sz]ation|outline|format)/.test(label)) {
    score = clamp01(0.3 * metrics.length + 0.7 * metrics.structure);
    notes =
      metrics.structure >= 0.5
        ? "Paragraph / list structure detected."
        : "Break the answer into paragraphs or bullets.";
  } else if (/(reason|causal|argument|analysis|logic)/.test(label)) {
    score = clamp01(0.5 * metrics.length + 0.5 * metrics.evidence);
    notes =
      metrics.evidence > 0
        ? "Causal language present (because / since / therefore)."
        : "Strengthen the reasoning with explicit causal links.";
  } else {
    score = clamp01(
      0.4 * metrics.length + 0.3 * metrics.evidence + 0.3 * metrics.structure,
    );
    notes = "Scored from length, evidence markers, and structure.";
  }
  return { id: dim.id, label: dim.label, score, weight: dim.weight, notes };
}

function aggregate(dims: ReadonlyArray<WebDimensionScore>): number {
  const total = dims.reduce((acc, d) => acc + d.weight, 0);
  if (total <= 0) return 0;
  return dims.reduce((acc, d) => acc + d.score * d.weight, 0) / total;
}

function deriveStatus(score: number, threshold: number): WebGradeStatus {
  if (score >= threshold) return "passed";
  if (score > 0) return "partial";
  return "failed";
}

function buildFeedback(
  status: WebGradeStatus,
  dims: ReadonlyArray<WebDimensionScore>,
): string {
  const head = `Status: ${status}`;
  const lines = dims.map(
    (d) => `- ${d.label}: ${(d.score * 100).toFixed(0)}%`,
  );
  return [head, ...lines].join("\n");
}

const FALLBACK_RUBRIC: WebRubricDimension[] = [
  { id: "evidence", label: "Evidence grounding", weight: 0.4 },
  { id: "reasoning", label: "Causal reasoning", weight: 0.4 },
  { id: "clarity", label: "Clarity", weight: 0.2 },
];

export function gradeWebAnswer(input: WebGradeInput): WebGrade {
  const text = extractText(input.answer).trim();
  const words = text.length === 0 ? 0 : text.split(/\s+/u).length;
  const metrics = {
    length: lengthScore(words),
    evidence: evidenceScore(text),
    structure: structureScore(text),
  };
  const rubric =
    input.rubric && input.rubric.length > 0 ? input.rubric : FALLBACK_RUBRIC;
  const dimensions = rubric.map((d) => scoreDimension(d, metrics));
  const passThreshold = clamp01(input.passThreshold ?? DEFAULT_PASS_THRESHOLD);
  const score = aggregate(dimensions);
  const status = words === 0 ? "failed" : deriveStatus(score, passThreshold);
  return {
    status,
    score,
    passThreshold,
    dimensions,
    feedback: buildFeedback(status, dimensions),
    wordCount: words,
  };
}
