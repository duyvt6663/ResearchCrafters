# QA — Package Landing Evidence Artifact (Preview Fidelity)

Date: 2026-05-15
Bullet: `backlog/01-mvp-platform.md:88` — Show one example evidence artifact at preview fidelity.

## Scope

The package landing page (`/packages/[slug]`) was rendering `EvidenceCard`
with hardcoded ResNet-shaped trajectories regardless of the package or
the manifest's `sampleArtifact.kind` field. The bullet was unchecked
because the artifact was not data-driven and would mislead any
non-ResNet package — the marketing surface implicitly promised an
authored preview but always showed the same illustration.

This change makes the artifact preview manifest-driven so the page
renders the package's real authored evidence at preview fidelity, with
a fallback only when a package has not yet supplied preview data.

## Changes

- `apps/web/lib/data/packages.ts`
  - Extended `ArtifactPreview` with optional `trajectories`, `rows`,
    `columns` fields.
  - `readArtifactPreview` now parses these from the manifest with
    defensive validation (silently drops malformed entries).
- `apps/web/app/packages/[slug]/page.tsx`
  - Added `artifactKindFor(manifestKind)` mapping
    `plot → training-curve`, `table → metric-table`, `log → figure`.
  - Renders `EvidenceCard` from `pkg.sampleArtifact`. Trajectories /
    rows / columns flow from the manifest. The hardcoded ResNet
    constant is renamed `FALLBACK_TRAINING_TRAJECTORIES` and only used
    when `kind === "plot"` and the manifest carries no trajectories.
- `packages/db/src/seed.ts`
  - `buildSampleArtifact` now emits `kind: "plot"` plus illustrative
    trajectories shaped from the authored
    `content/.../tables/training-curves.md` (plain vs residual at
    depth 56, expressed as accuracy curves over 164 epochs).
- `apps/web/lib/__tests__/data/packages.test.ts`
  - New test: manifest preview data (trajectories + rows + columns)
    survives projection; malformed entries are dropped.
- `backlog/01-mvp-platform.md`
  - Bullet checked.

## Verification

- `pnpm --filter @researchcrafters/web exec vitest run lib/__tests__/data/packages.test.ts`
  → 7 passed (1 new).
- `pnpm --filter @researchcrafters/ui exec vitest run test/evidence-card.test.tsx`
  → 3 passed.
- `pnpm --filter @researchcrafters/web exec tsc --noEmit` → clean.
- `pnpm --filter @researchcrafters/db exec tsc --noEmit` → clean.

## Out of scope

- No Playwright / e2e was run; package landing visual is verified
  through the EvidenceCard unit tests and the page is a server
  component with no client-side state in this path.
- `pricing` CTA bullet, `failed-branch redacted example` bullet, and
  the metadata bullet remain open under the same section.

## Spoiler-safety check

The seeded preview trajectories are phrased as accuracy curves and
ordered so residual visibly leads plain. No canonical mechanism, code,
or rubric is leaked: the `failed-branch redaction` already strips the
catalog of the wrong-but-plausible answer, and the artifact preview is
strictly comparative evidence (the same kind of plot a learner would
produce themselves at the end of the package).
