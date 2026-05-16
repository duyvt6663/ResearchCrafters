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

/**
 * Resolve the stage record bound to a graph node by trying both ref shapes
 * the loader accepts (`curriculum/...` absolute and `stages/...` relative).
 */
function stageRefForGraphStage(loaded: LoadedPackage, graphStage: string): string | null {
  const refs = loaded.stages.map((s) => s.ref);
  if (refs.includes(graphStage)) return graphStage;
  const prefixed = graphStage.startsWith('curriculum/')
    ? graphStage
    : path.posix.join('curriculum', graphStage);
  if (refs.includes(prefixed)) return prefixed;
  return refs.find((r) => r.endsWith(graphStage)) ?? null;
}

interface PrereqsPlan {
  /** Stage id (e.g. "S003") whose prereqs were resolved. */
  stageId: string;
  /** Graph node id (e.g. "N003") backing that stage. */
  nodeId: string;
  /** Prior stage ids in DAG order whose runner mode is not 'none'. */
  requiredStageIds: string[];
}

/**
 * Derive prior required stages for every runner-gated stage in the package.
 *
 * A stage is "runner-gated" when its `workspace/runner.yaml` entry declares
 * `mode != 'none'` — i.e. the Docker runner will actually execute something.
 * For each such stage we walk the curriculum graph backwards over both
 * `unlocks` and `unlocks_by_choice` edges, collect transitive predecessors,
 * and keep only those that are themselves runner-gated.
 *
 * The list is the deterministic plan a future Docker-backed sandbox pass
 * will iterate: "before running canonical S003, also run canonical against
 * S001 / S002 prerequisites and assert each passes." Emitting it statically
 * lets authors see the plan today and catch missing prerequisite coverage
 * (e.g. a runner-gated stage with zero prior runner-gated stages and no
 * canonical files) before the executor lands.
 *
 * Returned list is sorted by stage id for deterministic output.
 */
export function derivePrereqsPlans(loaded: LoadedPackage): PrereqsPlan[] {
  if (!loaded.runner) return [];
  const runnerStages = loaded.runner.stages as Record<string, { mode: string }>;

  const nodeIdToStageId = new Map<string, string>();
  for (const node of loaded.graph.nodes) {
    const ref = stageRefForGraphStage(loaded, node.stage);
    if (!ref) continue;
    const stage = loaded.stages.find((s) => s.ref === ref);
    if (!stage) continue;
    nodeIdToStageId.set(node.id, stage.data.id);
  }

  // Build reverse adjacency over the graph: child -> set of parent node ids.
  const parents = new Map<string, Set<string>>();
  for (const node of loaded.graph.nodes) {
    const outgoing = new Set<string>();
    for (const u of node.unlocks ?? []) outgoing.add(u);
    for (const list of Object.values(node.unlocks_by_choice ?? {})) {
      for (const u of list) outgoing.add(u);
    }
    for (const child of outgoing) {
      let bucket = parents.get(child);
      if (!bucket) {
        bucket = new Set<string>();
        parents.set(child, bucket);
      }
      bucket.add(node.id);
    }
  }

  function isRunnerGated(stageId: string): boolean {
    const cfg = runnerStages[stageId];
    return cfg !== undefined && cfg.mode !== 'none';
  }

  function ancestors(startNodeId: string): string[] {
    const seen = new Set<string>();
    const queue: string[] = [];
    for (const p of parents.get(startNodeId) ?? []) queue.push(p);
    while (queue.length) {
      const n = queue.shift()!;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const p of parents.get(n) ?? []) {
        if (!seen.has(p)) queue.push(p);
      }
    }
    return [...seen];
  }

  const plans: PrereqsPlan[] = [];
  for (const node of loaded.graph.nodes) {
    const stageId = nodeIdToStageId.get(node.id);
    if (!stageId) continue;
    if (!isRunnerGated(stageId)) continue;
    const priorNodeIds = ancestors(node.id);
    const priorStageIds = priorNodeIds
      .map((n) => nodeIdToStageId.get(n))
      .filter((s): s is string => typeof s === 'string')
      .filter(isRunnerGated)
      // Stable, package-author-friendly ordering: sort by stage id.
      .sort((a, b) => a.localeCompare(b));
    plans.push({ stageId, nodeId: node.id, requiredStageIds: priorStageIds });
  }
  return plans.sort((a, b) => a.stageId.localeCompare(b.stageId));
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

  const plans = derivePrereqsPlans(loaded);
  const hasRunnerGated = plans.length > 0;
  for (const plan of plans) {
    pushIssue(
      report,
      makeIssue(
        'sandbox',
        'info',
        'sandbox.canonical.prereqs.plan',
        plan.requiredStageIds.length === 0
          ? `Stage ${plan.stageId} has no prior runner-gated stages.`
          : `Stage ${plan.stageId} prior required stages: ${plan.requiredStageIds.join(', ')}.`,
        {
          ref: plan.stageId,
          pending: true,
        },
      ),
    );
  }

  const runnerStages = loaded.runner.stages as Record<
    string,
    { mode: string; output_paths?: string[] }
  >;
  for (const plan of plans) {
    const cfg = runnerStages[plan.stageId];
    const declared = cfg?.output_paths ?? [];
    const normalized: string[] = [];
    for (const raw of declared) {
      if (typeof raw !== 'string') continue;
      const trimmed = raw.trim();
      if (trimmed.length === 0) continue;
      if (path.isAbsolute(trimmed) || trimmed.startsWith('/')) {
        pushIssue(
          report,
          makeIssue(
            'sandbox',
            'error',
            'sandbox.output_paths.invalid',
            `Stage ${plan.stageId} output_paths entry '${raw}' must be a workspace-relative path.`,
            { ref: plan.stageId, path: raw },
          ),
        );
        continue;
      }
      const norm = path.posix.normalize(trimmed.replace(/\\/g, '/'));
      if (norm === '..' || norm.startsWith('../')) {
        pushIssue(
          report,
          makeIssue(
            'sandbox',
            'error',
            'sandbox.output_paths.invalid',
            `Stage ${plan.stageId} output_paths entry '${raw}' escapes the package root.`,
            { ref: plan.stageId, path: raw },
          ),
        );
        continue;
      }
      normalized.push(norm);
    }

    if (normalized.length === 0) {
      pushIssue(
        report,
        makeIssue(
          'sandbox',
          'warning',
          'sandbox.output_paths.missing',
          `Stage ${plan.stageId} is runner-gated but declares no output_paths; the future executor will have nothing to assert was produced.`,
          { ref: plan.stageId, pending: true },
        ),
      );
      continue;
    }

    pushIssue(
      report,
      makeIssue(
        'sandbox',
        'info',
        'sandbox.output_paths.plan',
        `Stage ${plan.stageId} expected runner outputs: ${normalized.join(', ')}.`,
        { ref: plan.stageId, pending: true },
      ),
    );
  }
  if (hasRunnerGated && loaded.solutions.canonicalFiles.length === 0) {
    pushIssue(
      report,
      makeIssue(
        'sandbox',
        'warning',
        'sandbox.canonical.missing',
        'Package has runner-gated stages but solutions/canonical/ is empty; canonical-prereq execution will have nothing to run.',
        { pending: true },
      ),
    );
  }

  return finalize(report);
}
