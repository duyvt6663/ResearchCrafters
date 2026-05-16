import path from 'node:path';
import kleur from 'kleur';
import {
  loadPackage,
  runStageLeakTests,
  collectStageRedactionTargets,
  defaultLeakTestGatewayFactory,
  type StageLeakTestOutcome,
  type RunStageLeakTestsInput,
} from '@researchcrafters/content-sdk';
import {
  AnthropicGateway,
  MockLLMGateway,
  type LLMGateway,
} from '@researchcrafters/ai';

export type LeakTestGatewayChoice =
  | 'clean-refusal'
  | 'sdk-default'
  | 'anthropic';

export interface LeakTestOptions {
  cwd?: string;
  json?: boolean;
  gateway?: LeakTestGatewayChoice;
}

export interface LeakTestReport {
  package: string;
  gateway: LeakTestGatewayChoice;
  stages: Array<{
    stageId: string;
    passed: boolean;
    skipped: boolean;
    attempts: number;
    leaks: StageLeakTestOutcome['leaks'];
  }>;
  ok: boolean;
}

function cleanRefusalGateway(): LLMGateway {
  return new MockLLMGateway(
    () =>
      'Take a first pass at a short response. I will react to your draft. I will not preview what to write before you try.',
  );
}

function resolveGatewayFactory(
  choice: LeakTestGatewayChoice,
): RunStageLeakTestsInput['gatewayFactory'] {
  if (choice === 'anthropic') {
    return () => new AnthropicGateway();
  }
  if (choice === 'sdk-default') {
    return defaultLeakTestGatewayFactory;
  }
  return () => cleanRefusalGateway();
}

function printOutcome(pkgPath: string, report: LeakTestReport): void {
  process.stdout.write(
    `\nLeak-test report for ${kleur.cyan(pkgPath)} ` +
      `(gateway=${report.gateway})\n`,
  );
  for (const s of report.stages) {
    if (s.skipped) {
      process.stdout.write(
        `  ${kleur.cyan('SKIP')} stage=${s.stageId} (no redaction targets, no authored attacks)\n`,
      );
      continue;
    }
    if (s.passed) {
      process.stdout.write(
        `  ${kleur.green('PASS')} stage=${s.stageId} attacks=${s.attempts}\n`,
      );
      continue;
    }
    process.stdout.write(
      `  ${kleur.red('FAIL')} stage=${s.stageId} attacks=${s.attempts} leaks=${s.leaks.length}\n`,
    );
    for (const leak of s.leaks) {
      process.stdout.write(
        `      ${kleur.red('leak')} attack=${leak.attackId} ` +
          `evidence=${JSON.stringify(leak.evidence)}\n`,
      );
    }
  }
  const summary = report.ok
    ? kleur.green('\nleak-test: PASS\n')
    : kleur.red('\nleak-test: FAIL\n');
  process.stdout.write(summary);
}

export async function leakTestCommand(
  packagePath: string,
  opts: LeakTestOptions = {},
): Promise<LeakTestReport> {
  const cwd = opts.cwd ?? process.cwd();
  const target = path.resolve(cwd, packagePath);
  const gateway = opts.gateway ?? 'clean-refusal';

  if (gateway === 'anthropic' && !process.env['ANTHROPIC_API_KEY']) {
    // Fail loudly rather than silently regressing to a mock; the caller
    // asked for the real gateway and the only safe answer is to surface
    // the missing secret.
    throw new Error(
      'leak-test: --gateway=anthropic requires ANTHROPIC_API_KEY in the environment.',
    );
  }

  const factory = resolveGatewayFactory(gateway);
  const loaded = await loadPackage(target);

  const stages: LeakTestReport['stages'] = [];
  for (const stage of loaded.stages) {
    const targets = collectStageRedactionTargets(loaded, stage);
    const input: RunStageLeakTestsInput = {
      packageDir: loaded.root,
      stage,
      redactionTargets: targets,
    };
    if (factory !== undefined) {
      input.gatewayFactory = factory;
    }
    const outcome = await runStageLeakTests(input);
    stages.push({
      stageId: outcome.stageId,
      passed: outcome.passed,
      skipped: outcome.skipped,
      attempts: outcome.attempts,
      leaks: outcome.leaks,
    });
  }

  const report: LeakTestReport = {
    package: target,
    gateway,
    stages,
    ok: stages.every((s) => s.passed),
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    printOutcome(target, report);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
  return report;
}
