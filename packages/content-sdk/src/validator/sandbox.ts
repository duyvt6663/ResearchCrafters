import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { LoadedPackage, ValidationReport } from '../types.js';
import { emptyReport, finalize, makeIssue, pushIssue } from './issues.js';
import { sha256File } from '../hash.js';

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function validateSandbox(loaded: LoadedPackage): Promise<ValidationReport> {
  const report = emptyReport();
  const root = loaded.root;

  pushIssue(
    report,
    makeIssue(
      'sandbox',
      'info',
      'sandbox.pending',
      'Sandbox layer is a stub: starter/canonical execution not run locally.',
      { pending: true },
    ),
  );

  if (!loaded.runner) {
    pushIssue(
      report,
      makeIssue(
        'sandbox',
        'warning',
        'sandbox.runner.missing',
        'No workspace/runner.yaml; skipping fixture hash verification.',
        { pending: true },
      ),
    );
    return finalize(report);
  }

  for (const [stageRef, stageRunner] of Object.entries(loaded.runner.stages)) {
    const fixtures = stageRunner.fixtures ?? [];
    for (const fixture of fixtures) {
      const abs = path.isAbsolute(fixture.path)
        ? fixture.path
        : path.join(root, fixture.path);
      if (!(await pathExists(abs))) {
        pushIssue(
          report,
          makeIssue(
            'sandbox',
            'error',
            'fixture.missing',
            `Fixture file missing: ${fixture.path}`,
            { path: fixture.path, ref: stageRef },
          ),
        );
        continue;
      }
      let actual: string;
      try {
        actual = await sha256File(abs);
      } catch (err) {
        pushIssue(
          report,
          makeIssue(
            'sandbox',
            'error',
            'fixture.hash_error',
            `Failed to hash fixture ${fixture.path}: ${String(err)}`,
            { path: fixture.path, ref: stageRef },
          ),
        );
        continue;
      }
      if (actual.toLowerCase() !== fixture.sha256.toLowerCase()) {
        pushIssue(
          report,
          makeIssue(
            'sandbox',
            'error',
            'fixture.hash_mismatch',
            `Fixture sha256 mismatch for ${fixture.path}: expected ${fixture.sha256}, got ${actual}`,
            { path: fixture.path, ref: stageRef },
          ),
        );
      }
    }
  }

  return finalize(report);
}
