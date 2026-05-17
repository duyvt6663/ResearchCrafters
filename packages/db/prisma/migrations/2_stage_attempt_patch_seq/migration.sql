-- Record the active PackageVersionPatch.patchSeq on each StageAttempt.
--
-- backlog/06-data-access-analytics.md §Version and Patch Policy line 69.
-- A non-null integer column with default 0 so existing rows backfill to
-- "base package version (no cosmetic patches applied)". Callers resolve
-- the active patch_seq via `resolveActivePatchSeq` in
-- `packages/db/src/active-patch-seq.ts` and pass it on insert; the
-- column is frozen on the row so analytics and replays can attribute
-- attempts to a specific patch generation even after later patches land.

ALTER TABLE "StageAttempt"
    ADD COLUMN "patchSeq" INTEGER NOT NULL DEFAULT 0;
