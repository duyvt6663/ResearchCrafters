import { promises as fs } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import matter from 'gray-matter';
import {
  packageSchema,
  graphSchema,
  stageSchema,
  branchSchema,
  rubricSchema,
  hintSchema,
  runnerSchema,
} from '@researchcrafters/erp-schema';
import type { ZodSchema } from 'zod';
import { ZodError } from 'zod';
import type { ValidationReport } from '../types.js';
import { emptyReport, finalize, makeIssue, pushIssue } from './issues.js';
import fg from 'fast-glob';

const REQUIRED_FILES = ['package.yaml', 'curriculum/graph.yaml'] as const;

const REQUIRED_DIRS = [
  'artifact',
  'curriculum',
  'curriculum/stages',
  'workspace',
] as const;

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

interface ParseTarget {
  rel: string;
  schema: ZodSchema;
  format: 'yaml' | 'frontmatter';
}

function recordZodError(report: ValidationReport, rel: string, err: ZodError): void {
  for (const issue of err.issues) {
    pushIssue(
      report,
      makeIssue('structural', 'error', 'schema.invalid', issue.message, {
        path: rel,
        ref: issue.path.join('.'),
      }),
    );
  }
}

async function parseFile(
  root: string,
  rel: string,
  schema: ZodSchema,
  format: 'yaml' | 'frontmatter',
  report: ValidationReport,
): Promise<void> {
  const abs = path.join(root, rel);
  if (!(await pathExists(abs))) return;
  let text: string;
  try {
    text = await fs.readFile(abs, 'utf8');
  } catch (err) {
    pushIssue(
      report,
      makeIssue('structural', 'error', 'file.read_error', String(err), { path: rel }),
    );
    return;
  }
  let raw: unknown;
  try {
    if (format === 'frontmatter') {
      raw = matter(text).data;
    } else {
      raw = yaml.load(text);
    }
  } catch (err) {
    pushIssue(
      report,
      makeIssue('structural', 'error', 'yaml.parse_error', String(err), { path: rel }),
    );
    return;
  }
  try {
    schema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      recordZodError(report, rel, err);
    } else {
      pushIssue(
        report,
        makeIssue('structural', 'error', 'schema.unknown_error', String(err), {
          path: rel,
        }),
      );
    }
  }
}

export async function validateStructural(packageDir: string): Promise<ValidationReport> {
  const report = emptyReport();
  const root = path.resolve(packageDir);

  for (const rel of REQUIRED_FILES) {
    if (!(await pathExists(path.join(root, rel)))) {
      pushIssue(
        report,
        makeIssue('structural', 'error', 'file.missing', `Required file missing: ${rel}`, {
          path: rel,
        }),
      );
    }
  }

  for (const rel of REQUIRED_DIRS) {
    if (!(await isDir(path.join(root, rel)))) {
      pushIssue(
        report,
        makeIssue('structural', 'warning', 'dir.missing', `Recommended directory missing: ${rel}`, {
          path: rel,
        }),
      );
    }
  }

  const targets: ParseTarget[] = [
    { rel: 'package.yaml', schema: packageSchema, format: 'yaml' },
    { rel: 'curriculum/graph.yaml', schema: graphSchema, format: 'yaml' },
  ];
  for (const t of targets) {
    await parseFile(root, t.rel, t.schema, t.format, report);
  }

  // Stages: glob curriculum/stages
  const stagesDir = path.join(root, 'curriculum', 'stages');
  if (await isDir(stagesDir)) {
    const entries = await fg(['**/*.md', '**/*.yaml', '**/*.yml'], {
      cwd: stagesDir,
      onlyFiles: true,
    });
    for (const entry of entries) {
      const rel = path.posix.join('curriculum/stages', entry);
      const format: 'yaml' | 'frontmatter' = entry.endsWith('.md') ? 'frontmatter' : 'yaml';
      await parseFile(root, rel, stageSchema, format, report);
    }
  }

  // Branches
  const branchesDir = path.join(root, 'curriculum', 'branches');
  if (await isDir(branchesDir)) {
    const entries = await fg(['**/*.yaml', '**/*.yml'], {
      cwd: branchesDir,
      onlyFiles: true,
    });
    for (const entry of entries) {
      const rel = path.posix.join('curriculum/branches', entry);
      await parseFile(root, rel, branchSchema, 'yaml', report);
    }
  }

  // Rubrics
  const rubricsDir = path.join(root, 'curriculum', 'rubrics');
  if (await isDir(rubricsDir)) {
    const entries = await fg(['**/*.yaml', '**/*.yml'], {
      cwd: rubricsDir,
      onlyFiles: true,
    });
    for (const entry of entries) {
      const rel = path.posix.join('curriculum/rubrics', entry);
      await parseFile(root, rel, rubricSchema, 'yaml', report);
    }
  }

  // Hints
  const hintsDir = path.join(root, 'curriculum', 'hints');
  if (await isDir(hintsDir)) {
    const entries = await fg(['**/*.yaml', '**/*.yml'], {
      cwd: hintsDir,
      onlyFiles: true,
    });
    for (const entry of entries) {
      const rel = path.posix.join('curriculum/hints', entry);
      await parseFile(root, rel, hintSchema, 'yaml', report);
    }
  }

  // Runner
  const runnerRel = 'workspace/runner.yaml';
  if (await pathExists(path.join(root, runnerRel))) {
    await parseFile(root, runnerRel, runnerSchema, 'yaml', report);
  } else {
    pushIssue(
      report,
      makeIssue(
        'structural',
        'warning',
        'runner.missing',
        'workspace/runner.yaml is missing; runner-mode stages cannot execute.',
        { path: runnerRel },
      ),
    );
  }

  return finalize(report);
}
