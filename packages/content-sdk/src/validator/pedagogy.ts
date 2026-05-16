import type { LoadedPackage, ValidationReport } from '../types.js';
import { emptyReport, finalize, makeIssue, pushIssue } from './issues.js';
import {
  collectStageRedactionTargets,
  runStageLeakTests,
  type RunStageLeakTestsInput,
} from './leak-tests.js';

export interface ValidatePedagogyOptions {
  skipLeakTests?: boolean;
  leakTestGatewayFactory?: RunStageLeakTestsInput['gatewayFactory'];
}

export async function validatePedagogy(
  loaded: LoadedPackage,
  options: ValidatePedagogyOptions = {},
): Promise<ValidationReport> {
  const report = emptyReport();

  for (const stage of loaded.stages) {
    const s = stage.data;

    // Clear task per stage.
    if (!s.task.prompt_md || s.task.prompt_md.trim().length < 10) {
      pushIssue(
        report,
        makeIssue(
          'pedagogy',
          'error',
          'stage.task.too_short',
          `Stage ${s.id} task.prompt_md is empty or too short.`,
          { path: stage.ref, ref: s.id },
        ),
      );
    }

    // Progressive hints exist.
    const hintsRef = s.stage_policy.hints?.progressive;
    if (!hintsRef) {
      pushIssue(
        report,
        makeIssue(
          'pedagogy',
          'warning',
          'stage.hints.absent',
          `Stage ${s.id} has no progressive hints declared.`,
          { path: stage.ref, ref: s.id },
        ),
      );
    } else {
      const hint = loaded.hints.find((h) => h.ref === hintsRef);
      if (hint && hint.data.hints.length < 1) {
        pushIssue(
          report,
          makeIssue(
            'pedagogy',
            'error',
            'stage.hints.empty',
            `Stage ${s.id} progressive hints file has no hint entries.`,
            { path: stage.ref, ref: s.id },
          ),
        );
      }
    }

    // Validation kind set.
    if (!s.stage_policy.validation.kind) {
      pushIssue(
        report,
        makeIssue(
          'pedagogy',
          'error',
          'stage.validation.kind.missing',
          `Stage ${s.id} has no validation kind.`,
          { path: stage.ref, ref: s.id },
        ),
      );
    }

    // Mentor leak tests required when LLM grading or LLM mentor visibility is enabled.
    const usesLlmGrading =
      s.stage_policy.validation.kind === 'rubric' ||
      s.stage_policy.validation.kind === 'hybrid';
    const visibility = s.stage_policy.mentor_visibility;
    const mentorReadsSensitive =
      visibility.canonical_solution !== 'never' ||
      visibility.branch_solutions !== 'never' ||
      visibility.evidence !== 'never';

    if ((usesLlmGrading || mentorReadsSensitive) && (!s.stage_policy.mentor_leak_tests || s.stage_policy.mentor_leak_tests.length === 0)) {
      pushIssue(
        report,
        makeIssue(
          'pedagogy',
          'error',
          'stage.mentor_leak_tests.missing',
          `Stage ${s.id} requires mentor_leak_tests because LLM grading or sensitive mentor visibility is enabled.`,
          { path: stage.ref, ref: s.id },
        ),
      );
    }

    // Redaction targets when canonical answers are gated.
    const canonicalGated =
      visibility.canonical_solution !== 'always' &&
      visibility.canonical_solution !== 'never';
    if (canonicalGated && (!s.stage_policy.mentor_redaction_targets || s.stage_policy.mentor_redaction_targets.length === 0)) {
      pushIssue(
        report,
        makeIssue(
          'pedagogy',
          'warning',
          'stage.redaction_targets.missing',
          `Stage ${s.id} gates canonical_solution but declares no mentor_redaction_targets.`,
          { path: stage.ref, ref: s.id },
        ),
      );
    }

    // Writing-module pedagogy contract. Backlog item: writing stages must
    // declare evidence constraints, a citation policy, rubric dimensions, and
    // a revision path. Without these the academic-writing evaluator has no
    // grounded surface to grade against and the learner has no signal to
    // revise from.
    if (s.type === 'writing') {
      // 1. Evidence constraints: at least one of `evidence_refs` /
      //    `source_refs` must be declared, otherwise the writing task has
      //    no allowed-evidence anchor for the evaluator's grounding pass.
      const hasEvidence =
        (s.evidence_refs?.length ?? 0) > 0 ||
        (s.source_refs?.length ?? 0) > 0;
      if (!hasEvidence) {
        pushIssue(
          report,
          makeIssue(
            'pedagogy',
            'error',
            'stage.writing.evidence_constraints.missing',
            `Writing stage ${s.id} declares no evidence_refs or source_refs; academic-writing evaluator cannot ground claims.`,
            { path: stage.ref, ref: s.id },
          ),
        );
      }

      // 2. Citation policy: task.prompt_md must spell out how the learner
      //    should cite (the evaluator enforces "cite allowed refs only" but
      //    needs the policy to be visible to the learner). Cheap textual
      //    check — author can satisfy with "cite", "citation", "reference",
      //    or "evidence" in the prompt.
      const promptLc = (s.task.prompt_md ?? '').toLowerCase();
      const declaresCitationPolicy = /\b(cite|citation|reference|evidence)\b/.test(
        promptLc,
      );
      if (!declaresCitationPolicy) {
        pushIssue(
          report,
          makeIssue(
            'pedagogy',
            'warning',
            'stage.writing.citation_policy.unspecified',
            `Writing stage ${s.id} task prompt does not mention a citation policy (cite / citation / reference / evidence).`,
            { path: stage.ref, ref: s.id },
          ),
        );
      }

      // 3. Rubric dimensions: writing is rubric-graded by definition.
      //    Require `validation.kind` to be rubric or hybrid AND the linked
      //    rubric to exist with at least one dimension. Without this there
      //    is nothing for the academic-writing evaluator to score against.
      const vkind = s.stage_policy.validation.kind;
      const rubricRef = s.stage_policy.validation.rubric;
      const rubricGraded = vkind === 'rubric' || vkind === 'hybrid';
      if (!rubricGraded || !rubricRef) {
        pushIssue(
          report,
          makeIssue(
            'pedagogy',
            'error',
            'stage.writing.rubric.missing',
            `Writing stage ${s.id} must use validation.kind=rubric|hybrid with a rubric reference; got kind=${vkind}, rubric=${rubricRef ?? '<none>'}.`,
            { path: stage.ref, ref: s.id },
          ),
        );
      } else {
        const linked = loaded.rubrics.find((r) => r.ref === rubricRef);
        if (!linked) {
          pushIssue(
            report,
            makeIssue(
              'pedagogy',
              'error',
              'stage.writing.rubric.unresolved',
              `Writing stage ${s.id} references rubric ${rubricRef} but no matching rubric is loaded.`,
              { path: stage.ref, ref: s.id },
            ),
          );
        } else if ((linked.data.dimensions?.length ?? 0) === 0) {
          pushIssue(
            report,
            makeIssue(
              'pedagogy',
              'error',
              'stage.writing.rubric.no_dimensions',
              `Writing stage ${s.id} rubric ${rubricRef} has no dimensions.`,
              { path: stage.ref, ref: s.id },
            ),
          );
        }
      }

      // 4. Revision behavior: the learner needs SOMETHING to revise
      //    against after a failed attempt — canonical guidance text,
      //    common-misconception notes, or progressive hints. Absence of
      //    all three means a "fail" surface with no actionable signal.
      const hasCanonical =
        typeof s.stage_policy.feedback.canonical_md === 'string' &&
        s.stage_policy.feedback.canonical_md.trim().length > 0;
      const hasMisconceptions =
        (s.stage_policy.feedback.common_misconceptions?.length ?? 0) > 0;
      const hasHints = Boolean(s.stage_policy.hints?.progressive);
      if (!hasCanonical && !hasMisconceptions && !hasHints) {
        pushIssue(
          report,
          makeIssue(
            'pedagogy',
            'warning',
            'stage.writing.revision_behavior.missing',
            `Writing stage ${s.id} has no revision signal: feedback.canonical_md, feedback.common_misconceptions, and hints.progressive are all empty.`,
            { path: stage.ref, ref: s.id },
          ),
        );
      }
    }
  }

  // First two stages should be quick.
  const firstTwo = [...loaded.stages]
    .sort((a, b) => a.ref.localeCompare(b.ref))
    .slice(0, 2);
  const totalFirstTwo = firstTwo.reduce(
    (sum, s) => sum + s.data.estimated_time_minutes,
    0,
  );
  if (firstTwo.length === 2 && totalFirstTwo > 20) {
    pushIssue(
      report,
      makeIssue(
        'pedagogy',
        'warning',
        'stages.first_two.too_long',
        `First two stages combined estimated_time_minutes is ${totalFirstTwo}; should be <= 20 to keep onboarding fast.`,
      ),
    );
  }

  // Run mentor leak tests unless explicitly skipped. The default gateway is a
  // deterministic mock from `leak-tests.ts` — package CI swaps in the real
  // Anthropic gateway. We emit info-level issues for passes/skips and an
  // error-level issue per detected leak so the report shows the harness ran.
  if (!options.skipLeakTests) {
    for (const stage of loaded.stages) {
      const targets = collectStageRedactionTargets(loaded, stage);
      // Plumb per-attack `must_not_contain` from authored leak tests. The
      // runner already reads this directly off the stage's
      // `mentor_leak_tests[*].must_not_contain` list, but we forward it
      // explicitly here so the validator's contract surface is symmetric with
      // the global `redactionTargets` plumbing — and so callers passing an
      // already-loaded stage without going through `loadPackage` get the same
      // behaviour.
      const perAttack: Record<string, string[]> = {};
      const tests = stage.data.stage_policy.mentor_leak_tests ?? [];
      for (let i = 0; i < tests.length; i += 1) {
        const t = tests[i]!;
        const id = t.attack_id ?? `authored-${i + 1}`;
        if (t.must_not_contain && t.must_not_contain.length > 0) {
          perAttack[id] = [...t.must_not_contain];
        }
      }
      const input: RunStageLeakTestsInput = {
        packageDir: loaded.root,
        stage,
        redactionTargets: targets,
      };
      if (Object.keys(perAttack).length > 0) {
        input.perAttackMustNotContain = perAttack;
      }
      if (options.leakTestGatewayFactory !== undefined) {
        input.gatewayFactory = options.leakTestGatewayFactory;
      }
      const outcome = await runStageLeakTests(input);
      if (outcome.skipped) {
        pushIssue(
          report,
          makeIssue(
            'pedagogy',
            'info',
            'pedagogy.leak_test_skipped',
            `Stage ${stage.data.id}: leak-test harness skipped (no redaction targets and no authored attacks).`,
            { ref: stage.data.id },
          ),
        );
        continue;
      }
      if (outcome.leaks.length === 0) {
        pushIssue(
          report,
          makeIssue(
            'pedagogy',
            'info',
            'pedagogy.leak_test_passed',
            `Stage ${stage.data.id}: ${outcome.attempts} leak-test attack(s) ran clean.`,
            { ref: stage.data.id },
          ),
        );
      } else {
        for (const leak of outcome.leaks) {
          pushIssue(
            report,
            makeIssue(
              'pedagogy',
              'error',
              'pedagogy.leak_test_failed',
              `Stage ${stage.data.id}: leak detected via attack '${leak.attackId ?? 'unknown'}' — output matched a redaction target.`,
              { ref: stage.data.id },
            ),
          );
        }
      }
    }
  }

  return finalize(report);
}
