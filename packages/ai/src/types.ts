import type { StagePolicy, MentorVisibility } from '@researchcrafters/erp-schema';

/**
 * Tier of model used for a request. Cheaper models handle hints; stronger
 * models handle evidence-grounded writing feedback. Recorded on every message
 * for cost and quality audits (see TODOS/05).
 */
export type ModelTier = 'hint' | 'feedback';

/**
 * Provider tag. Currently we only ship an Anthropic adapter; this exists so the
 * runtime can swap providers without changing call sites.
 */
export type Provider = 'anthropic' | 'mock';

export interface MentorContext {
  stageId: string;
  attempt: number;
  packageVersionId: string;
  /** Subset of stage_policy.mentor_visibility scopes that resolved to allowed. */
  allowedScopes: ReadonlyArray<keyof MentorVisibility>;
  /** Static stage copy + artifact excerpts loaded under policy. */
  artifactExcerpts: ReadonlyArray<{ ref: string; text: string }>;
  /** Rubric criteria text — only populated when visibility allows it. */
  rubricCriteria?: ReadonlyArray<string>;
  /** Branch feedback text — only populated when visibility allows it. */
  branchFeedback?: ReadonlyArray<{ branchId: string; text: string }>;
  /**
   * Strings the model must never quote verbatim. Sourced from
   * `stage_policy.mentor_redaction_targets`.
   */
  redactionTargets: ReadonlyArray<string>;
  /** Snapshot of the policy used to assemble this context, for audit. */
  policySnapshot: StagePolicy;
}

export interface MentorMessage {
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  /* model metadata — required on every assistant message per TODOS/05 */
  modelTier?: ModelTier;
  modelId?: string;
  provider?: Provider;
  promptTokens?: number;
  completionTokens?: number;
  redactionTriggered?: boolean;
  flagged?: boolean;
  createdAt: string;
}

export interface LLMRequest {
  modelTier: ModelTier;
  /** Provider-specific model id, e.g. 'claude-3-5-haiku-latest'. */
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  /** Hard token budget for this single call. */
  maxOutputTokens: number;
  /** Optional temperature; provider-specific defaults apply otherwise. */
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  modelTier: ModelTier;
  modelId: string;
  provider: Provider;
  promptTokens: number;
  completionTokens: number;
  /** Optional finish reason if the provider exposes one. */
  finishReason?: string;
}

export interface LeakTestAttack {
  id: string;
  prompt: string;
  /** Human-readable category for reports: 'direct', 'roleplay', etc. */
  category: string;
}

export interface LeakTestResult {
  passed: boolean;
  leaks: ReadonlyArray<{
    attackId: string;
    prompt: string;
    /** Substring(s) of the model output that matched a redaction target. */
    evidence: string[];
  }>;
  /** All attacks that ran, useful for surfacing in CI logs. */
  attacks: ReadonlyArray<LeakTestAttack>;
}

export type BudgetDecision =
  | { kind: 'allow' }
  | { kind: 'degrade'; toTier: ModelTier; reason: string }
  | { kind: 'refuse'; reason: string };

export interface BudgetCheck {
  decision: BudgetDecision;
  /** Spend snapshots so callers can render warnings ("80% used"). */
  perUserSpendUsd: number;
  perPackageSpendUsd: number;
  perStageSpendUsd: number;
}
