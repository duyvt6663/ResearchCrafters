-- Surface per-package mentor budget caps on `PackageVersion`.
--
-- Adds three nullable USD columns referenced by the mentor runtime's
-- `BudgetCaps` (see `packages/ai/src/cost-cap.ts`). `null` means inherit
-- the platform default resolved by `defaultMentorBudgetCaps()`; setting
-- any column pins that scope to a package-specific value for both
-- pre-flight `checkBudget` enforcement and post-flight
-- `recordMentorRequestSpend` alerts.

ALTER TABLE "PackageVersion"
    ADD COLUMN "mentorBudgetUserDailyUsd" DOUBLE PRECISION,
    ADD COLUMN "mentorBudgetPackageUsd"   DOUBLE PRECISION,
    ADD COLUMN "mentorBudgetStageUsd"     DOUBLE PRECISION;
