#!/usr/bin/env node
// Asserts that every fixture recorded in a package's workspace/runner.yaml
// has a sha256 matching the file currently committed. Run from the repo root.
//
// Intentionally dependency-free: parses just the `fixtures:` blocks we need
// from runner.yaml so CI can call it before pnpm install completes. The full
// SDK validator also performs this check, but a focused, fast CI step gives
// clearer failure attribution and survives changes to the broader validator.

import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const PACKAGES_GLOB_ROOT = 'content/packages';

async function sha256File(absPath) {
  const buf = await fs.readFile(absPath);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Extract { stagePath, sha256 } entries from a runner.yaml string by scanning
 * for `path:` / `sha256:` pairs nested under `fixtures:`. Sufficient for the
 * shapes the SDK loader accepts; the full validator runs a real YAML parse.
 */
function extractFixtures(yaml) {
  const lines = yaml.split('\n');
  const out = [];
  let inFixtures = false;
  let fixturesIndent = -1;
  let pending = null;

  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ');
    const indent = line.match(/^ */)[0].length;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (/^fixtures:\s*$/.test(trimmed)) {
      inFixtures = true;
      fixturesIndent = indent;
      pending = null;
      continue;
    }

    if (inFixtures && indent <= fixturesIndent && trimmed.endsWith(':')) {
      if (pending && pending.path && pending.sha256) out.push(pending);
      pending = null;
      inFixtures = false;
      continue;
    }

    if (!inFixtures) continue;

    if (trimmed.startsWith('- ')) {
      if (pending && pending.path && pending.sha256) out.push(pending);
      pending = {};
      const rest = trimmed.slice(2).trim();
      const m = rest.match(/^(path|sha256):\s*(.*)$/);
      if (m) pending[m[1]] = stripQuotes(m[2]);
      continue;
    }

    const m = trimmed.match(/^(path|sha256):\s*(.*)$/);
    if (m && pending) pending[m[1]] = stripQuotes(m[2]);
  }
  if (pending && pending.path && pending.sha256) out.push(pending);
  return out;
}

function stripQuotes(v) {
  const s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

async function listPackages(root) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const dirs = [];
  for (const e of entries) {
    if (e.isDirectory()) dirs.push(path.join(root, e.name));
  }
  return dirs;
}

async function main() {
  const repoRoot = process.cwd();
  const packages = await listPackages(path.join(repoRoot, PACKAGES_GLOB_ROOT));
  let checked = 0;
  let failures = 0;

  for (const pkgDir of packages) {
    const runnerPath = path.join(pkgDir, 'workspace', 'runner.yaml');
    let yaml;
    try {
      yaml = await fs.readFile(runnerPath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    const fixtures = extractFixtures(yaml);
    for (const f of fixtures) {
      checked += 1;
      const fixturePath = path.isAbsolute(f.path) ? f.path : path.join(pkgDir, f.path);
      const rel = path.relative(repoRoot, fixturePath);
      let actual;
      try {
        actual = await sha256File(fixturePath);
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.error(`FAIL ${rel}: fixture file is missing on disk`);
        } else {
          console.error(`FAIL ${rel}: ${err.message}`);
        }
        failures += 1;
        continue;
      }
      if (actual.toLowerCase() !== f.sha256.toLowerCase()) {
        console.error(
          `FAIL ${rel}: sha256 mismatch\n  recorded: ${f.sha256}\n  actual:   ${actual}`,
        );
        failures += 1;
      } else {
        console.log(`OK   ${rel}`);
      }
    }
  }

  if (checked === 0) {
    console.log('No fixtures declared under content/packages/*/workspace/runner.yaml');
    return;
  }
  console.log(`\nChecked ${checked} fixture(s); ${failures} failure(s).`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
