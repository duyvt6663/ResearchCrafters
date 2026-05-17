# QA: Exclude passive-summary users from the first cohort

- Backlog item: `backlog/07-alpha-launch.md:13` — "Exclude users who only want
  passive summaries from the first cohort."
- Scope: documentation/policy deliverable only. No code, schema, or runtime
  paths changed.
- Date: 2026-05-17
- Result: PASS

## Deliverable

- `docs/ALPHA_PERSONA.md` § "Hard exclusions for the first cohort" already
  defines the exclusion rule with explicit mapping to this backlog line:
  > "Wants passive summaries, digests, or 'tell me what the paper says'
  > outputs."
- `backlog/07-alpha-launch.md:13` is now checked off and references the
  persona doc section, so reviewers do not need to re-derive the criterion
  when wiring the intake-form screening rubric
  (`backlog/07-alpha-launch.md:14`) or waitlist page
  (`backlog/07-alpha-launch.md:18`).

## Verification

- `rg -n "passive summaries" docs backlog` confirms the rule lives in
  `docs/ALPHA_PERSONA.md` (hard exclusions list) and is now cited from
  `backlog/07-alpha-launch.md:13`.
- The persona doc's screening rubric explicitly routes "matches any hard
  exclusion" to auto-reject, so the policy has a downstream enforcement
  path once the intake form ships.
- No code paths changed → no unit/integration test run required.

## Out of scope (deferred to existing backlog items)

- Encoding the exclusion as an intake-form field/rubric question — owned by
  `backlog/07-alpha-launch.md:14`.
- Public waitlist copy that surfaces the cohort's hands-on stance to
  self-deselect passive-summary seekers — owned by
  `backlog/07-alpha-launch.md:18`.

## Residual risks

- Policy without an intake-form question is enforced only by manual review.
  Risk is acceptable while the cohort is small (20-50). When the intake
  form lands, add a yes/no item that maps to this exclusion so screening
  is auditable.
- Self-reported intent can underreport "I just want summaries" preference.
  Mitigated by the persona doc's required-artifact field (public repo,
  blog, gist) — applicants with no hands-on artifact are auto-rejected.
