/**
 * Strips secret-looking patterns from logs before persistence/display. This is
 * the last line of defence — runner environments are stripped, but the
 * learner's own code or test output may still print credentials.
 */

interface ScrubRule {
  name: string;
  pattern: RegExp;
}

const RULES: ScrubRule[] = [
  // AWS access key id
  { name: 'aws_access_key_id', pattern: /AKIA[0-9A-Z]{16}/g },
  // Generic 40-char hex secret (matches access tokens, API keys)
  { name: 'hex_token_40', pattern: /\b[0-9a-fA-F]{40}\b/g },
  // GitHub PAT
  { name: 'github_pat', pattern: /ghp_[A-Za-z0-9]{30,}/g },
  // sk- style API keys
  { name: 'openai_or_similar_sk', pattern: /sk-[A-Za-z0-9_-]{20,}/g },
  // Bearer tokens in Authorization headers
  { name: 'bearer_token', pattern: /[Bb]earer\s+[A-Za-z0-9._-]{20,}/g },
  // Common KEY=VALUE secret patterns
  {
    name: 'env_secret_assignment',
    pattern: /(SECRET|TOKEN|PASSWORD|API[_-]?KEY)\s*=\s*[A-Za-z0-9._/+=-]{8,}/gi,
  },
  // Private key blocks
  {
    name: 'private_key_block',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
];

export interface ScrubResult {
  text: string;
  triggered: string[];
}

export function scrubLogs(input: string): ScrubResult {
  let text = input;
  const triggered: string[] = [];
  for (const rule of RULES) {
    // Reset lastIndex defensively — RULES are module-level and reused.
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) {
      triggered.push(rule.name);
      rule.pattern.lastIndex = 0;
      text = text.replace(rule.pattern, `[scrubbed:${rule.name}]`);
    }
  }
  return { text, triggered };
}
