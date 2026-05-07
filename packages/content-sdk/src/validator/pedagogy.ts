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
      const input: RunStageLeakTestsInput = {
        packageDir: loaded.root,
        stage,
        redactionTargets: targets,
      };
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
