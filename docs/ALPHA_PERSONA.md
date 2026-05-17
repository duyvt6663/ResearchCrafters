# Alpha Persona

Last updated: 2026-05-17

Purpose: define the single target persona for the ResearchCrafters alpha cohort
so recruiting, intake screening, the waitlist page, and the flagship package
all aim at the same user. This document is the source of truth that
`backlog/07-alpha-launch.md > Audience` ladders up to.

## Primary persona: "The Engineer Who Wants Research Taste"

A working AI/ML engineer (typically 3-10 YoE) who reads papers regularly but
does not feel research-fluent. They can ship ML/LLM code, but when asked
"why does this paper's choice work and the obvious alternative not?" they
notice the gap. They want to close it through reps, not lectures.

### Demographics and context

- Role: ML engineer, applied research engineer, LLM systems engineer,
  infra-for-ML engineer, or strong backend engineer pivoting into ML.
- Tenure: 3-10 years total engineering experience; 6+ months of ML or LLM work.
- Environment: works at a startup, AI lab eng team, or product team that ships
  models. Not in a PhD lab, not a pure prompt-engineer.
- Tooling fluency: comfortable in a terminal, can run `pnpm`/`uv`/`docker`,
  can read PyTorch, can read a benchmark table without help.
- Time budget: 3-6 focused hours per week available for deliberate practice
  over a 2-4 week alpha.

### Motivations (in priority order)

1. Build durable research taste — the ability to predict which design choice
   will work and which will silently fail.
2. Stop bouncing off papers. Convert "I read it" into "I could defend it".
3. Earn a credible, shareable signal of depth that is not another certificate.
4. Find a structured way to spend evenings/weekends that compounds, instead of
   another tutorial or summary feed.

### Jobs to be done

- "When a new paper drops in my domain, help me understand the decisions
  behind it well enough to argue with a colleague who actually built it."
- "Give me hard branches where I can fail safely and see why."
- "Show me my own confusion before a code review or interview does."

### Behavioral signals we expect

- Has at least one paper they've tried to reimplement (success or failure).
- Has opinions about at least one of: attention variants, RLHF/DPO,
  optimizer choice, tokenization, eval design.
- Posts, comments, or asks questions in technical communities (HN, X/AI
  Twitter, Eleuther/HF/Latent Space Discords, lab Slacks, paper reading
  groups). They don't just lurk on summaries.
- Willing to spend money on tools that make them better at their craft
  (Cursor, GitHub Copilot, JetBrains, books, courses they actually finished).

## Secondary persona (must include ≥5 in cohort): "The Senior Reviewer"

Senior engineer, staff+ engineer, or working researcher (8+ YoE or PhD/postdoc
equivalent) who can judge whether the ERP oversimplifies the paper. They are
in the cohort primarily for quality feedback, not for personal upskilling.
Their value is signal on `Quality Questions` in `backlog/07-alpha-launch.md`.

Recruit at least 5. Treat their feedback channels separately (direct call,
not just async form).

## Hard exclusions for the first cohort

A waitlist applicant is excluded from the first cohort if any of these are
true. These map to `backlog/07-alpha-launch.md:13`.

- Wants passive summaries, digests, or "tell me what the paper says" outputs.
- Has zero hands-on ML/LLM coding history (no repos, no notebooks, no
  production ML work).
- Cannot or will not run code locally and is unwilling to use a provided
  runner (e.g. wants a no-code experience).
- Looking primarily for interview prep flashcards or LeetCode-style drills.
- Pure marketing/PM/student-without-engineering-background profile (route to
  a future cohort, not the alpha).
- Cannot commit at least 3 hours/week for the alpha window.

These exclusions are deliberate to keep cohort signal high; they are not a
permanent product stance.

## Channels to reach this persona

Used by recruiting (`backlog/07-alpha-launch.md:11`) and the waitlist page
(`backlog/07-alpha-launch.md:18`).

- AI/ML subreddits and HN comment threads on relevant paper launches.
- X/Twitter posts anchored on decision-challenge content
  (see `docs/MARKETING.md` viral hook section).
- Latent Space, Eleuther, HuggingFace, MLOps Community Discords/Slacks
  (post in #papers, #learning, #research channels — read each server's rules).
- Targeted DMs to authors of public paper-reimplementation repos and
  paper-review blogs.
- Personal network of the founding team's engineering contacts.

Do not start with pure-academic mailing lists, generic developer
newsletters, or low-context paid ads — they pull the wrong persona.

## Implications for intake form

The intake form (`backlog/07-alpha-launch.md:14`) must collect enough signal
to verify the persona and exclusions above. At minimum:

- Current role, company stage (one-line), years of engineering, months of ML.
- Last paper they tried to reimplement or work through, and what happened.
- Link to a public artifact (GitHub, blog, gist, Kaggle, talk) — required for
  the primary persona; optional only for the Senior Reviewer track.
- Which paper from the flagship shortlist they most want to work through and
  why (free text, ≥2 sentences — short answers are a screening signal).
- Weekly hours they can commit during the alpha window.
- Self-identify track: "I want to learn" (primary) vs "I want to review
  quality" (senior).
- Explicit yes/no: willing to run code locally and submit work for feedback.
- Willing to be interviewed (15-30 min) at end of alpha.

Screening rubric (used to accept/reject applicants):

- Auto-accept: primary persona signal strong + public artifact + intent
  answer is specific.
- Manual review: missing one signal but plausible.
- Auto-reject: matches any hard exclusion above.

## Cohort composition target

- Total: 20-50 (matches `backlog/07-alpha-launch.md:11`).
- At least 5 Senior Reviewer slots reserved
  (`backlog/07-alpha-launch.md:12`).
- Aim for ≥60% primary persona, ≤20% Senior Reviewer, ≤20% adjacent
  (graduate students with strong eng background, infra-for-ML engineers).

## Out of scope (deliberately)

- Defining pricing for this persona — see `backlog/07-alpha-launch.md >
  Pricing Test`.
- Designing the waitlist page and intake form UI — owned by their own
  backlog items; this doc only specifies the inputs they must collect.
- Recruiting plan operational checklist — owned by
  `backlog/07-alpha-launch.md:11` and the cohort operations section.

## References

- `docs/MARKETING.md` § 3 Audience — narrative positioning that this
  persona makes operational.
- `docs/PRD.md` § 11 Success Metrics — the metrics this cohort must move.
- `backlog/07-alpha-launch.md` — owns the alpha launch workstream.
