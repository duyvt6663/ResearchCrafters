import { promises as fs } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import matter from 'gray-matter';
import fg from 'fast-glob';
import {
  packageSchema,
  graphSchema,
  stageSchema,
  branchSchema,
  rubricSchema,
  hintSchema,
  runnerSchema,
} from '@researchcrafters/erp-schema';
import type {
  ArtifactIndex,
  BranchRecord,
  HintRecord,
  LoadedPackage,
  RubricRecord,
  SolutionsIndex,
  StageRecord,
} from './types.js';

async function readText(absPath: string): Promise<string> {
  return fs.readFile(absPath, 'utf8');
}

async function exists(absPath: string): Promise<boolean> {
  try {
    await fs.stat(absPath);
    return true;
  } catch {
    return false;
  }
}

function parseYaml(text: string): unknown {
  return yaml.load(text);
}

function relRef(root: string, absPath: string): string {
  return path.relative(root, absPath).split(path.sep).join('/');
}

async function loadPackageMeta(root: string): Promise<LoadedPackage['package']> {
  const file = path.join(root, 'package.yaml');
  const text = await readText(file);
  const raw = parseYaml(text);
  return packageSchema.parse(raw);
}

async function loadGraph(root: string): Promise<LoadedPackage['graph']> {
  const file = path.join(root, 'curriculum', 'graph.yaml');
  const text = await readText(file);
  const raw = parseYaml(text);
  return graphSchema.parse(raw);
}

async function loadStages(root: string): Promise<StageRecord[]> {
  const dir = path.join(root, 'curriculum', 'stages');
  if (!(await exists(dir))) return [];
  const entries = await fg(['**/*.md', '**/*.yaml', '**/*.yml'], {
    cwd: dir,
    dot: false,
    onlyFiles: true,
  });
  const records: StageRecord[] = [];
  for (const entry of entries.sort()) {
    const abs = path.join(dir, entry);
    const text = await readText(abs);
    let raw: unknown;
    if (entry.endsWith('.md')) {
      const fm = matter(text);
      raw = fm.data;
    } else {
      raw = parseYaml(text);
    }
    const parsed = stageSchema.parse(raw);
    records.push({ ref: relRef(root, abs), path: abs, data: parsed });
  }
  return records;
}

async function loadBranches(root: string): Promise<BranchRecord[]> {
  const dir = path.join(root, 'curriculum', 'branches');
  if (!(await exists(dir))) return [];
  const entries = await fg(['**/*.yaml', '**/*.yml'], {
    cwd: dir,
    dot: false,
    onlyFiles: true,
  });
  const records: BranchRecord[] = [];
  for (const entry of entries.sort()) {
    const abs = path.join(dir, entry);
    const text = await readText(abs);
    const raw = parseYaml(text);
    const parsed = branchSchema.parse(raw);
    records.push({ ref: relRef(root, abs), path: abs, data: parsed });
  }
  return records;
}

async function loadRubrics(root: string): Promise<RubricRecord[]> {
  const dir = path.join(root, 'curriculum', 'rubrics');
  if (!(await exists(dir))) return [];
  const entries = await fg(['**/*.yaml', '**/*.yml'], {
    cwd: dir,
    dot: false,
    onlyFiles: true,
  });
  const records: RubricRecord[] = [];
  for (const entry of entries.sort()) {
    const abs = path.join(dir, entry);
    const text = await readText(abs);
    const raw = parseYaml(text);
    const parsed = rubricSchema.parse(raw);
    records.push({ ref: relRef(root, abs), path: abs, data: parsed });
  }
  return records;
}

async function loadHints(root: string): Promise<HintRecord[]> {
  const dir = path.join(root, 'curriculum', 'hints');
  if (!(await exists(dir))) return [];
  const entries = await fg(['**/*.yaml', '**/*.yml'], {
    cwd: dir,
    dot: false,
    onlyFiles: true,
  });
  const records: HintRecord[] = [];
  for (const entry of entries.sort()) {
    const abs = path.join(dir, entry);
    const text = await readText(abs);
    const raw = parseYaml(text);
    const parsed = hintSchema.parse(raw);
    records.push({ ref: relRef(root, abs), path: abs, data: parsed });
  }
  return records;
}

async function loadRunner(root: string): Promise<LoadedPackage['runner']> {
  const file = path.join(root, 'workspace', 'runner.yaml');
  if (!(await exists(file))) return null;
  const text = await readText(file);
  const raw = parseYaml(text);
  return runnerSchema.parse(raw);
}

async function indexSolutions(root: string): Promise<SolutionsIndex> {
  const canonical = path.join(root, 'solutions', 'canonical');
  const branches = path.join(root, 'solutions', 'branches');
  const canonicalFiles = (await exists(canonical))
    ? (
        await fg(['**/*'], { cwd: canonical, onlyFiles: true })
      ).map((p) => relRef(root, path.join(canonical, p)))
    : [];
  const branchFiles = (await exists(branches))
    ? (
        await fg(['**/*'], { cwd: branches, onlyFiles: true })
      ).map((p) => relRef(root, path.join(branches, p)))
    : [];
  return { canonicalFiles, branchFiles };
}

async function indexArtifact(root: string): Promise<ArtifactIndex> {
  const artifactRoot = path.join(root, 'artifact');
  const paperMdAbs = path.join(artifactRoot, 'PAPER.md');
  const paperMd = (await exists(paperMdAbs)) ? relRef(root, paperMdAbs) : null;

  const logicDir = path.join(artifactRoot, 'logic');
  const srcDir = path.join(artifactRoot, 'src');
  const evidenceDir = path.join(artifactRoot, 'evidence');
  const traceTreeAbs = path.join(artifactRoot, 'trace', 'exploration_tree.yaml');

  const logicFiles = (await exists(logicDir))
    ? (
        await fg(['**/*'], { cwd: logicDir, onlyFiles: true })
      ).map((p) => relRef(root, path.join(logicDir, p)))
    : [];
  const srcFiles = (await exists(srcDir))
    ? (
        await fg(['**/*'], { cwd: srcDir, onlyFiles: true })
      ).map((p) => relRef(root, path.join(srcDir, p)))
    : [];
  const evidencePaths = (await exists(evidenceDir))
    ? (
        await fg(['**/*'], { cwd: evidenceDir, onlyFiles: true })
      ).map((p) => relRef(root, path.join(evidenceDir, p)))
    : [];
  const traceTreePath = (await exists(traceTreeAbs)) ? relRef(root, traceTreeAbs) : null;

  return { paperMd, logicFiles, srcFiles, traceTreePath, evidencePaths };
}

export async function loadPackage(packageDir: string): Promise<LoadedPackage> {
  const root = path.resolve(packageDir);
  const [
    packageMeta,
    graph,
    stages,
    branches,
    rubrics,
    hints,
    runner,
    solutions,
    artifact,
  ] = await Promise.all([
    loadPackageMeta(root),
    loadGraph(root),
    loadStages(root),
    loadBranches(root),
    loadRubrics(root),
    loadHints(root),
    loadRunner(root),
    indexSolutions(root),
    indexArtifact(root),
  ]);

  return {
    root,
    package: packageMeta,
    graph,
    stages,
    branches,
    rubrics,
    hints,
    runner,
    solutions,
    artifact,
  };
}
