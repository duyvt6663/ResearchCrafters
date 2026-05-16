/**
 * Citation/evidence enforcement for academic-writing stages.
 *
 * Writing rubrics ask the learner to back claims with citations to the
 * stage's allowed evidence set (artifact ids, paper section anchors, etc.).
 * This module is the deterministic primitive that flags or rejects claims
 * that cite nothing or cite something outside the allow-list. It composes
 * under the rubric layer the same way `checkNumeric` does for math stages:
 * a caller supplies a list of authored or extracted claims plus the stage's
 * citation policy, and the result tells the rubric/LLM grader which claims
 * to penalize, surface, or refuse outright.
 *
 * Design notes:
 *   - Claims are passed in pre-split with their cited refs. Splitting prose
 *     into claims is the caller's responsibility (LLM-driven extraction or
 *     authored fixtures); a thin `extractCitationRefs` helper is provided
 *     for the common bracket-style citation tokens.
 *   - Policy is explicit: `allowedEvidenceRefs` is the canonical set. When
 *     a stage permits placeholders (e.g. early draft stages), the caller
 *     names the placeholder tokens; otherwise placeholders fail.
 *   - The check is a flag pass, not a refusal. Callers decide whether
 *     `flagged === true` should down-score, surface to the learner, or
 *     trigger `EvaluatorRefusal`. This keeps the primitive composable with
 *     both deterministic and LLM grading paths.
 */

export type WritingClaimFailureReason =
  | 'no_citation'
  | 'disallowed_citation'
  | 'placeholder_disallowed'
  | 'spec_invalid';

export interface WritingClaimSpec {
  /** Claim id authored or assigned by the caller. */
  id: string;
  /** The claim sentence/bullet. Surfaced in feedback; not parsed. */
  text: string;
  /** Refs the learner attached to this claim. Empty means uncited. */
  citedRefs?: ReadonlyArray<string>;
  /**
   * Per-claim override: even when the stage policy disallows placeholders,
   * an author can tag a specific claim as `requiresCitation: false` so we
   * do not flag it (e.g. background framing sentences). Defaults to true.
   */
  requiresCitation?: boolean;
}

export interface WritingClaimPolicy {
  /** Canonical evidence refs the stage allows learners to cite. */
  allowedEvidenceRefs: ReadonlyArray<string>;
  /**
   * Tokens that count as legitimate placeholders for this stage (e.g.
   * `"<TBD>"`, `"PLACEHOLDER"`). Only honored when `placeholderAllowed` is
   * true. When honored, the claim is flagged-but-passing so the UI can
   * still mark the draft as incomplete.
   */
  placeholderTokens?: ReadonlyArray<string>;
  /** Whether `placeholderTokens` count as a satisfying citation. */
  placeholderAllowed?: boolean;
}

export interface WritingClaimResult {
  id: string;
  /** True when the claim has at least one valid citation (or is exempt). */
  passed: boolean;
  /**
   * True when the rubric should surface or down-score this claim. A claim
   * that is allowed-via-placeholder is `passed=true` but `flagged=true`.
   */
  flagged: boolean;
  /** Why the claim failed, when it failed or was flagged. */
  reason?: WritingClaimFailureReason;
  /** Cited refs accepted against `allowedEvidenceRefs`. */
  acceptedRefs: ReadonlyArray<string>;
  /** Cited refs that were not in the allow-list and not placeholders. */
  disallowedRefs: ReadonlyArray<string>;
  /** Cited refs that matched `placeholderTokens`. */
  placeholderRefs: ReadonlyArray<string>;
  /** Short human-facing note for feedback assembly. */
  note: string;
}

export interface WritingClaimBatch {
  results: ReadonlyArray<WritingClaimResult>;
  total: number;
  passed: number;
  failed: number;
  flagged: number;
}

function uniq(refs: ReadonlyArray<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of refs) {
    if (!seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out;
}

function spec_invalid(id: string, message: string): WritingClaimResult {
  return {
    id,
    passed: false,
    flagged: true,
    reason: 'spec_invalid',
    acceptedRefs: [],
    disallowedRefs: [],
    placeholderRefs: [],
    note: message,
  };
}

export function checkWritingClaim(
  spec: WritingClaimSpec,
  policy: WritingClaimPolicy,
): WritingClaimResult {
  if (!spec.id || typeof spec.id !== 'string') {
    return spec_invalid('', 'claim spec is missing an id');
  }
  if (!spec.text || typeof spec.text !== 'string') {
    return spec_invalid(spec.id, 'claim spec is missing text');
  }

  const allowed = new Set(policy.allowedEvidenceRefs);
  const placeholderSet = new Set(policy.placeholderTokens ?? []);
  const placeholderAllowed = policy.placeholderAllowed === true;
  const requiresCitation = spec.requiresCitation !== false;

  const cited = uniq(spec.citedRefs ?? []);

  // Bucket refs.
  const acceptedRefs: string[] = [];
  const disallowedRefs: string[] = [];
  const placeholderRefs: string[] = [];
  for (const ref of cited) {
    if (allowed.has(ref)) {
      acceptedRefs.push(ref);
    } else if (placeholderSet.has(ref)) {
      placeholderRefs.push(ref);
    } else {
      disallowedRefs.push(ref);
    }
  }

  // Disallowed refs always fail — they are unauthorized citations.
  if (disallowedRefs.length > 0) {
    return {
      id: spec.id,
      passed: false,
      flagged: true,
      reason: 'disallowed_citation',
      acceptedRefs,
      disallowedRefs,
      placeholderRefs,
      note: `Claim "${spec.id}" cites refs outside the allow-list: ${disallowedRefs.join(', ')}.`,
    };
  }

  if (acceptedRefs.length > 0) {
    // Mixed accepted + placeholder still passes; placeholders alone surface a flag.
    const flagged = placeholderRefs.length > 0;
    return {
      id: spec.id,
      passed: true,
      flagged,
      acceptedRefs,
      disallowedRefs,
      placeholderRefs,
      note: flagged
        ? `Claim "${spec.id}" cites ${acceptedRefs.length} allowed ref(s) and ${placeholderRefs.length} placeholder(s).`
        : `Claim "${spec.id}" cites ${acceptedRefs.length} allowed ref(s).`,
    };
  }

  // Only placeholders cited.
  if (placeholderRefs.length > 0) {
    if (placeholderAllowed) {
      return {
        id: spec.id,
        passed: true,
        flagged: true,
        acceptedRefs,
        disallowedRefs,
        placeholderRefs,
        note: `Claim "${spec.id}" relies on placeholder(s) ${placeholderRefs.join(', ')}; replace before final submission.`,
      };
    }
    return {
      id: spec.id,
      passed: false,
      flagged: true,
      reason: 'placeholder_disallowed',
      acceptedRefs,
      disallowedRefs,
      placeholderRefs,
      note: `Claim "${spec.id}" cites placeholder(s) ${placeholderRefs.join(', ')} but this stage does not allow placeholders.`,
    };
  }

  // No citations at all.
  if (!requiresCitation) {
    return {
      id: spec.id,
      passed: true,
      flagged: false,
      acceptedRefs,
      disallowedRefs,
      placeholderRefs,
      note: `Claim "${spec.id}" is exempt from citation.`,
    };
  }
  return {
    id: spec.id,
    passed: false,
    flagged: true,
    reason: 'no_citation',
    acceptedRefs,
    disallowedRefs,
    placeholderRefs,
    note: `Claim "${spec.id}" makes an unsupported claim with no allowed evidence ref.`,
  };
}

/**
 * Stage-level enforcement verdict for citation policy.
 *
 * `enforceCitationPolicy` composes `checkWritingClaimBatch` with the stage's
 * authoring policy and a caller-chosen mode:
 *
 *   - `strict`: any failing claim (no citation, disallowed citation,
 *     disallowed placeholder, or invalid spec) makes the verdict `failed` and
 *     the caller is expected to raise `EvaluatorRefusal` with the reason
 *     `citation_policy_violation`. Strict mode is intended for final-submission
 *     writing stages whose rubric requires every claim to be backed.
 *   - `flag`: failing claims down-score and surface in feedback but the
 *     verdict stays `passed` so the LLM grader still runs. Intended for
 *     draft/early stages where placeholders are allowed and partial credit
 *     is honored.
 *
 * The summary is feedback-ready: one bullet per failing/flagged claim with
 * the reason and offending refs. Callers can append it to grade feedback or
 * pass it to the LLM grader as additional rubric context.
 */
export type CitationEnforcementMode = 'strict' | 'flag';
export type CitationEnforcementVerdict = 'passed' | 'failed';

export interface CitationEnforcementResult {
  verdict: CitationEnforcementVerdict;
  mode: CitationEnforcementMode;
  batch: WritingClaimBatch;
  /** Feedback-ready bullet list of every failing or flagged claim. */
  summary: string;
  /** Suggested EvaluatorRefusal reason when verdict==='failed' in strict mode. */
  refusalReason?: 'citation_policy_violation';
  /** Feedback-ready refusal message when verdict==='failed' in strict mode. */
  refusalMessage?: string;
}

export function enforceCitationPolicy(
  specs: ReadonlyArray<WritingClaimSpec>,
  policy: WritingClaimPolicy,
  options?: { mode?: CitationEnforcementMode },
): CitationEnforcementResult {
  const mode: CitationEnforcementMode = options?.mode ?? 'strict';
  const batch = checkWritingClaimBatch(specs, policy);

  const offenders = batch.results.filter((r) => !r.passed || r.flagged);
  const summaryLines = offenders.map((r) => `- [${r.reason ?? 'flagged'}] ${r.note}`);
  const summary =
    offenders.length === 0
      ? `Citation policy: all ${batch.total} claim(s) satisfy the allow-list.`
      : `Citation policy issues (${batch.failed} failing, ${batch.flagged} flagged of ${batch.total}):\n${summaryLines.join('\n')}`;

  const verdict: CitationEnforcementVerdict =
    mode === 'strict' && batch.failed > 0 ? 'failed' : 'passed';

  if (verdict === 'failed') {
    return {
      verdict,
      mode,
      batch,
      summary,
      refusalReason: 'citation_policy_violation',
      refusalMessage: `Citation policy violated: ${batch.failed} claim(s) fail the stage allow-list.\n${summary}`,
    };
  }
  return { verdict, mode, batch, summary };
}

export function checkWritingClaimBatch(
  specs: ReadonlyArray<WritingClaimSpec>,
  policy: WritingClaimPolicy,
): WritingClaimBatch {
  const results = specs.map((s) => checkWritingClaim(s, policy));
  const passed = results.filter((r) => r.passed).length;
  const flagged = results.filter((r) => r.flagged).length;
  return {
    results,
    total: results.length,
    passed,
    failed: results.length - passed,
    flagged,
  };
}

/**
 * Pull bracket-style citation tokens out of a free-text claim. Recognizes
 * `[E1]`, `[E-3]`, `[evidence/foo]`, `[artifact/bar.png]`, and any other
 * `[...]` slug. Returns the tokens in source order, de-duplicated.
 *
 * This is a convenience for callers that author claims as plain prose
 * with inline citation tokens; structured pipelines that already carry a
 * `citedRefs` list should use that directly.
 */
export function extractCitationRefs(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\[([^\[\]\n]+?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1] ?? '';
    const token = raw.trim();
    if (!token) continue;
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}
