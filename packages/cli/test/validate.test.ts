import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCommand } from '../src/commands/validate.js';

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

describe('researchcrafters validate', () => {
  it('passes on the sample fixture and exits with success', async () => {
    const prevExit = process.exitCode;
    const report = await validateCommand(FIXTURE, { json: true });
    expect(report.ok).toBe(true);
    expect(process.exitCode === undefined || process.exitCode === 0 || process.exitCode === prevExit).toBe(true);
  });

  it('fails when the package directory is empty', async () => {
    const report = await validateCommand(path.join(__dirname, 'empty-pkg-does-not-exist'), {
      json: true,
    });
    expect(report.ok).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
    process.exitCode = 0;
  });
});
