/**
 * Pattern-based redactor. Accepts literal substrings and simple glob patterns
 * with `*` (zero-or-more chars) and `?` (single char). Case-insensitive by
 * default — package authors typically write canonical phrases in one form, but
 * adversarial outputs may shift case.
 */

export interface RedactionResult {
  text: string;
  triggered: boolean;
  /** Targets that fired at least one match, useful for telemetry. */
  matchedTargets: string[];
}

const REDACTED = '[redacted]';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function targetToPattern(target: string): RegExp {
  const hasGlob = /[*?]/.test(target);
  if (!hasGlob) {
    return new RegExp(escapeRegex(target), 'gi');
  }
  // Treat * and ? as glob wildcards; everything else escaped.
  let pattern = '';
  for (const ch of target) {
    if (ch === '*') pattern += '.*';
    else if (ch === '?') pattern += '.';
    else pattern += escapeRegex(ch);
  }
  return new RegExp(pattern, 'gi');
}

export function redact(
  input: string,
  targets: ReadonlyArray<string>,
): RedactionResult {
  if (targets.length === 0) {
    return { text: input, triggered: false, matchedTargets: [] };
  }
  let text = input;
  let triggered = false;
  const matchedTargets: string[] = [];
  for (const target of targets) {
    if (target.length === 0) continue;
    // Use a fresh regex each call site — `.test()` advances lastIndex on /g
    // regexes which would corrupt a follow-up `.replace`.
    const detectRe = targetToPattern(target);
    if (detectRe.test(text)) {
      triggered = true;
      matchedTargets.push(target);
      const replaceRe = targetToPattern(target);
      text = text.replace(replaceRe, REDACTED);
    }
  }
  return { text, triggered, matchedTargets };
}

/**
 * Detect-only variant — returns the matched substrings without modifying the
 * text. Used by the leak-test harness to surface evidence in CI output.
 */
export function findRedactionEvidence(
  input: string,
  targets: ReadonlyArray<string>,
): string[] {
  const evidence: string[] = [];
  for (const target of targets) {
    if (target.length === 0) continue;
    const re = targetToPattern(target);
    const matches = input.match(re);
    if (matches) evidence.push(...matches);
  }
  return evidence;
}
