# QA: Define target alpha persona

- Backlog item: `backlog/07-alpha-launch.md:10` — "Define target alpha persona."
- Scope: documentation deliverable only. No production code, schema, or runtime
  paths changed.
- Date: 2026-05-17
- Result: PASS

## Deliverable

- New file: `docs/ALPHA_PERSONA.md`
  - Defines primary persona ("Engineer Who Wants Research Taste") with
    demographics, motivations, JTBD, and behavioral signals.
  - Defines secondary "Senior Reviewer" persona with cohort floor (≥5).
  - Lists hard exclusions mapping to `backlog/07-alpha-launch.md:13`.
  - Lists recruiting channels feeding `backlog/07-alpha-launch.md:11`.
  - Specifies intake-form required fields and screening rubric feeding
    `backlog/07-alpha-launch.md:14`.
  - Specifies cohort composition target tied to
    `backlog/07-alpha-launch.md:11-12`.
  - Cross-references `docs/MARKETING.md` § Audience and `docs/PRD.md`
    § Success Metrics so downstream work has a single source of truth.

## Verification

- `rg -n "ALPHA_PERSONA" backlog docs` confirms the persona doc is referenced
  from `backlog/07-alpha-launch.md` (checked-off bullet).
- `backlog/07-alpha-launch.md` Audience section bullet is checked off with the
  doc link.
- No code paths changed → no unit/integration test run required.
- Spec is internally consistent with MARKETING.md § 3 Audience (engineer-led
  reachable market, not pure academics).

## Out of scope (deferred to existing backlog items)

- Building the public waitlist page (`backlog/07-alpha-launch.md:18`).
- Implementing the intake form UI (`backlog/07-alpha-launch.md:14`) — this
  doc only specifies the inputs it must collect.
- Executing recruiting (`backlog/07-alpha-launch.md:11-12`) — this doc only
  defines who to recruit and via which channels.

## Residual risks

- Persona is a hypothesis until validated against actual waitlist signal.
  First batch of intake-form responses should be reviewed against the
  screening rubric here; if >30% of strong-fit applicants fail the rubric,
  the persona doc needs revision rather than the recruiting plan.
- Hard-exclusion list will create some friction (e.g. PMs, pure researchers
  pushed to a later cohort). Acceptable for alpha signal quality;
  re-evaluate before public launch.
