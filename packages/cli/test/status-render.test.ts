// Status-render unit tests. Pin the fixes for the QA report's two CLI gaps:
//
//   1. `slug@slug@stub` rendering bug at `commands/status.ts:16` — the old
//      code naively interpolated `${cfg.packageSlug}@${cfg.packageVersionId}`
//      even though the enroll route already returns `packageVersionId` as
//      `${slug}@stub`. The new `formatPackageDisplay` collapses the
//      duplication.
//   2. `submit` -> `status` round-trip — the contract test ensures the shape
//      parses, but a small unit test here pins that `setProjectConfig`
//      actually persists `lastRunId` to disk where `status` can read it.

import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  formatPackageDisplay,
  readProjectConfig,
  setProjectConfig,
  PROJECT_CONFIG_PATH,
} from '../src/lib/config.js';
import { renderStatus, relativeTime } from '../src/commands/status.js';

async function makeWorkspace(
  partial: Partial<{
    packageSlug: string;
    packageVersionId: string;
    stageRef: string;
    apiUrl: string;
    lastRunId: string;
  }> = {},
): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-status-'));
  const dir = path.join(cwd, '.researchcrafters');
  await fs.mkdir(dir, { recursive: true });
  const cfg = {
    apiUrl: partial.apiUrl ?? 'http://localhost:3001',
    packageSlug: partial.packageSlug ?? 'resnet',
    packageVersionId: partial.packageVersionId ?? 'resnet@stub',
    stageRef: partial.stageRef ?? 'S001',
    ...(partial.lastRunId !== undefined ? { lastRunId: partial.lastRunId } : {}),
  };
  await fs.writeFile(
    path.join(dir, 'config.json'),
    JSON.stringify(cfg, null, 2) + '\n',
    'utf8',
  );
  return cwd;
}

describe('formatPackageDisplay (QA Drift #2: slug@slug@stub)', () => {
  it('collapses the doubled `@` when packageVersionId already starts with `${slug}@`', () => {
    expect(
      formatPackageDisplay({
        packageSlug: 'resnet',
        packageVersionId: 'resnet@stub',
      }),
    ).toBe('resnet@stub');
  });

  it('renders the version verbatim when it does not embed the slug', () => {
    expect(
      formatPackageDisplay({
        packageSlug: 'resnet',
        packageVersionId: '0.1.0',
      }),
    ).toBe('resnet@0.1.0');
  });

  it('falls back to the bare slug when packageVersionId is missing', () => {
    expect(formatPackageDisplay({ packageSlug: 'resnet' })).toBe('resnet');
  });

  it('shortens cuid-shaped version ids for readability', () => {
    const id = 'cmovf11t40009akq840ry9qje'; // 24-char cuid (no `.`, no `-`)
    const out = formatPackageDisplay({
      packageSlug: 'resnet',
      packageVersionId: id,
    });
    // Must keep `slug@` and not duplicate it. Suffix is shortened to 12 chars.
    expect(out.startsWith('resnet@')).toBe(true);
    expect(out).not.toContain('resnet@resnet');
    expect(out.length).toBeLessThanOrEqual('resnet@'.length + 12);
  });
});

describe('renderStatus output', () => {
  it('uses formatPackageDisplay so the doubled-`@` bug stays fixed', () => {
    const lines = renderStatus(
      {
        apiUrl: 'http://localhost:3001',
        packageSlug: 'resnet',
        packageVersionId: 'resnet@stub',
        stageRef: 'S001',
      },
      null,
    );
    const pkgLine = lines.find((l) => l.includes('Package:'));
    expect(pkgLine).toBeDefined();
    expect(pkgLine).toContain('resnet@stub');
    expect(pkgLine).not.toContain('resnet@resnet');
  });

  it('prints the friendly "no runs yet" hint pointing at submit', () => {
    const lines = renderStatus(
      {
        apiUrl: 'http://localhost:3001',
        packageSlug: 'resnet',
        packageVersionId: 'resnet@stub',
        stageRef: 'S001',
      },
      null,
    );
    const hint = lines.find((l) => l.toLowerCase().includes('no runs yet'));
    expect(hint).toBeDefined();
    // Must point at the submit command so the user has an actionable next step.
    expect(hint).toContain('researchcrafters submit');
  });

  it('renders run status, executionStatus, timestamps and logUrl when present', () => {
    const fixedNow = Date.parse('2026-05-07T10:05:00.000Z');
    const lines = renderStatus(
      {
        apiUrl: 'http://localhost:3001',
        packageSlug: 'resnet',
        packageVersionId: 'resnet@stub',
        stageRef: 'S001',
        lastRunId: 'run-abc',
      },
      {
        id: 'run-abc',
        status: 'ok',
        executionStatus: 'ok',
        startedAt: '2026-05-07T10:00:00.000Z',
        finishedAt: '2026-05-07T10:03:00.000Z',
        logUrl: 'https://example.invalid/logs/run-abc',
      },
      { now: fixedNow },
    );
    const joined = lines.join('\n');
    expect(joined).toContain('Last run:');
    expect(joined).toContain('run-abc');
    expect(joined).toContain('Status:');
    expect(joined).toContain('Execution:');
    expect(joined).toContain('Started:');
    expect(joined).toContain('Finished:');
    expect(joined).toContain('Logs:');
    expect(joined).toContain('https://example.invalid/logs/run-abc');
    // Relative-time helper kicks in.
    expect(joined).toMatch(/2m ago|3m ago|5m ago/);
  });
});

describe('relativeTime', () => {
  it('returns "--" for missing or invalid timestamps', () => {
    expect(relativeTime(undefined)).toBe('--');
    expect(relativeTime(null)).toBe('--');
    expect(relativeTime('not-a-date')).toBe('--');
  });
  it('formats seconds, minutes, hours, days', () => {
    const now = Date.parse('2026-05-07T12:00:00.000Z');
    expect(relativeTime('2026-05-07T11:59:30.000Z', now)).toBe('30s ago');
    expect(relativeTime('2026-05-07T11:58:00.000Z', now)).toBe('2m ago');
    expect(relativeTime('2026-05-07T09:00:00.000Z', now)).toBe('3h ago');
    expect(relativeTime('2026-05-04T12:00:00.000Z', now)).toBe('3d ago');
  });
});

describe('setProjectConfig persists lastRunId for `status` to read', () => {
  it('round-trips `lastRunId` through the workspace config', async () => {
    const cwd = await makeWorkspace();
    await setProjectConfig({ lastRunId: 'run-xyz' }, cwd);
    const cfg = await readProjectConfig(cwd);
    expect(cfg.lastRunId).toBe('run-xyz');
    // Must not clobber existing fields.
    expect(cfg.packageSlug).toBe('resnet');
    expect(cfg.stageRef).toBe('S001');
    // File on disk reflects the new value too.
    const onDisk = JSON.parse(
      await fs.readFile(path.join(cwd, PROJECT_CONFIG_PATH), 'utf8'),
    ) as { lastRunId?: string };
    expect(onDisk.lastRunId).toBe('run-xyz');
  });

  it('overwrites a previous lastRunId on subsequent submit calls', async () => {
    const cwd = await makeWorkspace({ lastRunId: 'run-old' });
    await setProjectConfig({ lastRunId: 'run-new' }, cwd);
    const cfg = await readProjectConfig(cwd);
    expect(cfg.lastRunId).toBe('run-new');
  });
});
