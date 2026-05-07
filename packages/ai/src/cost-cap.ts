import type { BudgetCheck, BudgetDecision, ModelTier } from './types.js';

/**
 * USD price per 1M input/output tokens, per model id. Callers pass the active
 * price table at request time so prices can change without redeploys.
 */
export interface ModelPrice {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

export type PriceTable = Readonly<Record<string, ModelPrice>>;

export interface SpendStore {
  /** Current spend in USD for a user's running daily window. */
  getUserDailySpendUsd(userId: string): Promise<number>;
  getPackageSpendUsd(packageId: string): Promise<number>;
  getStageSpendUsd(packageId: string, stageId: string): Promise<number>;
  /** Record spend after a successful request. */
  recordSpend(args: {
    userId: string;
    packageId: string;
    stageId: string;
    usd: number;
  }): Promise<void>;
}

export interface BudgetCaps {
  perUserDailyUsd: number;
  perPackageUsd: number;
  perStageUsd: number;
}

export interface CheckBudgetInput {
  userId: string;
  packageId: string;
  stageId: string;
  modelTier: ModelTier;
  modelId: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  prices: PriceTable;
  caps: BudgetCaps;
  store: SpendStore;
}

export function estimateRequestCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  prices: PriceTable,
): number {
  const price = prices[modelId];
  if (!price) {
    // No price → conservative: report 0 so callers degrade rather than over-refuse.
    return 0;
  }
  const inputUsd = (inputTokens / 1_000_000) * price.inputPerMillionUsd;
  const outputUsd = (outputTokens / 1_000_000) * price.outputPerMillionUsd;
  return inputUsd + outputUsd;
}

/**
 * Returns the budget decision for a planned request. Order of severity:
 *
 * 1. If per-stage cap blown → refuse.
 * 2. If per-package cap blown → refuse.
 * 3. If per-user daily cap blown but request is `feedback` → degrade to `hint`.
 * 4. If per-user daily cap blown and already `hint` → refuse.
 * 5. Else → allow.
 */
export async function checkBudget(input: CheckBudgetInput): Promise<BudgetCheck> {
  const estimatedUsd = estimateRequestCostUsd(
    input.modelId,
    input.estimatedInputTokens,
    input.estimatedOutputTokens,
    input.prices,
  );

  const [userSpend, packageSpend, stageSpend] = await Promise.all([
    input.store.getUserDailySpendUsd(input.userId),
    input.store.getPackageSpendUsd(input.packageId),
    input.store.getStageSpendUsd(input.packageId, input.stageId),
  ]);

  let decision: BudgetDecision;
  if (stageSpend + estimatedUsd > input.caps.perStageUsd) {
    decision = {
      kind: 'refuse',
      reason: `per-stage cap of $${input.caps.perStageUsd.toFixed(2)} reached`,
    };
  } else if (packageSpend + estimatedUsd > input.caps.perPackageUsd) {
    decision = {
      kind: 'refuse',
      reason: `per-package cap of $${input.caps.perPackageUsd.toFixed(2)} reached`,
    };
  } else if (userSpend + estimatedUsd > input.caps.perUserDailyUsd) {
    if (input.modelTier === 'feedback') {
      decision = {
        kind: 'degrade',
        toTier: 'hint',
        reason: 'per-user daily cap reached; degrading to hint tier',
      };
    } else {
      decision = {
        kind: 'refuse',
        reason: 'per-user daily cap reached',
      };
    }
  } else {
    decision = { kind: 'allow' };
  }

  return {
    decision,
    perUserSpendUsd: userSpend,
    perPackageSpendUsd: packageSpend,
    perStageSpendUsd: stageSpend,
  };
}
