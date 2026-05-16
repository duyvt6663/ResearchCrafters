import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leakTestCommand } from '../src/commands/leak-test.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'content-sdk',
  'test',
  'fixtures',
  'sample-package',
);

describe('researchcrafters leak-test', () => {
  it('passes with the clean-refusal mock gateway against the sample package', async () => {
    const prevExit = process.exitCode;
    const report = await leakTestCommand(FIXTURE, {
      json: true,
      gateway: 'clean-refusal',
    });
    expect(report.ok).toBe(true);
    expect(report.gateway).toBe('clean-refusal');
    expect(report.stages.length).toBeGreaterThan(0);
    for (const s of report.stages) {
      expect(s.passed).toBe(true);
    }
    expect(process.exitCode === undefined || process.exitCode === 0 || process.exitCode === prevExit).toBe(true);
  });

  it('fails when sdk-default gateway echoes redaction targets', async () => {
    // Re-use the same fixture. The sdk-default mock deliberately echoes the
    // first redaction target on the `direct-ask` attack, so any stage that
    // has redaction targets must report leaks. If the sample package has no
    // redaction targets we skip the assertion rather than over-spec the fixture.
    const report = await leakTestCommand(FIXTURE, {
      json: true,
      gateway: 'sdk-default',
    });
    const stageHadTargets = report.stages.some((s) => !s.skipped);
    if (stageHadTargets) {
      expect(report.ok).toBe(false);
    } else {
      expect(report.ok).toBe(true);
    }
    process.exitCode = 0;
  });

  it('refuses --gateway=anthropic without ANTHROPIC_API_KEY', async () => {
    const prev = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    try {
      await expect(
        leakTestCommand(FIXTURE, { json: true, gateway: 'anthropic' }),
      ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (prev !== undefined) process.env['ANTHROPIC_API_KEY'] = prev;
    }
  });
});
