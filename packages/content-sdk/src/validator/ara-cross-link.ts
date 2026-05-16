import { promises as fs } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { LoadedPackage, ValidationReport } from '../types.js';
import { emptyReport, finalize, makeIssue, pushIssue } from './issues.js';

interface TraceNode {
  id?: unknown;
  kind?: unknown;
  refs?: unknown;
  parents?: unknown;
  children?: unknown;
  branch_id?: unknown;
}

interface TraceEdge {
  from?: unknown;
  to?: unknown;
  kind?: unknown;
}

function stripFragment(ref: string): string {
  const idx = ref.indexOf('#');
  return idx === -1 ? ref : ref.slice(0, idx);
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await fs.stat(absPath);
    return true;
  } catch {
    return false;
  }
}

function flattenTraceNodes(
  raw: unknown,
  acc: TraceNode[] = [],
): TraceNode[] {
  if (!raw) return acc;
  if (Array.isArray(raw)) {
    for (const item of raw) flattenTraceNodes(item, acc);
    return acc;
  }
  if (typeof raw === 'object') {
    const node = raw as TraceNode & { nodes?: unknown };
    if ('id' in node) acc.push(node);
    if (Array.isArray(node.children)) flattenTraceNodes(node.children, acc);
    if (Array.isArray((node as { nodes?: unknown }).nodes)) {
      flattenTraceNodes((node as { nodes?: unknown[] }).nodes, acc);
    }
  }
  return acc;
}

function validateTraceNode(
  n: TraceNode,
  ids: Set<string>,
  knownArtifactPaths: Set<string>,
  branchById: Map<string, unknown>,
  tracePath: string,
  report: ValidationReport,
): void {
  const nodeId = n.id as string;

  if (Array.isArray(n.refs)) {
    for (const r of n.refs) {
      if (typeof r !== 'string') continue;
      const noFrag = stripFragment(r);
      if (noFrag.startsWith('artifact/') && !knownArtifactPaths.has(noFrag)) {
        pushIssue(
          report,
          makeIssue(
            'ara-cross-link',
            'warning',
            'trace.ref.unresolved',
            `Trace node ${nodeId} ref does not resolve: ${r}`,
            { path: tracePath, ref: nodeId },
          ),
        );
      }
    }
  } else if (n.refs !== undefined && n.refs !== null) {
    pushIssue(
      report,
      makeIssue(
        'ara-cross-link',
        'error',
        'trace.node.refs_invalid',
        `Trace node ${nodeId} has non-array refs.`,
        { path: tracePath, ref: nodeId },
      ),
    );
  }

  if (n.parents !== undefined && n.parents !== null) {
    if (!Array.isArray(n.parents)) {
      pushIssue(
        report,
        makeIssue(
          'ara-cross-link',
          'error',
          'trace.node.parents_invalid',
          `Trace node ${nodeId} has non-array parents.`,
          { path: tracePath, ref: nodeId },
        ),
      );
    } else {
      for (const p of n.parents) {
        if (typeof p !== 'string' || p.length === 0) {
          pushIssue(
            report,
            makeIssue(
              'ara-cross-link',
              'error',
              'trace.parent.invalid',
              `Trace node ${nodeId} has invalid parent entry.`,
              { path: tracePath, ref: nodeId },
            ),
          );
          continue;
        }
        if (!ids.has(p)) {
          pushIssue(
            report,
            makeIssue(
              'ara-cross-link',
              'error',
              'trace.parent.missing',
              `Trace node ${nodeId} parent references unknown node: ${p}`,
              { path: tracePath, ref: nodeId },
            ),
          );
        }
        if (p === nodeId) {
          pushIssue(
            report,
            makeIssue(
              'ara-cross-link',
              'error',
              'trace.parent.self_reference',
              `Trace node ${nodeId} lists itself as its own parent.`,
              { path: tracePath, ref: nodeId },
            ),
          );
        }
      }
    }
  }

  if (Array.isArray(n.children)) {
    for (const c of n.children) {
      if (typeof c === 'string') {
        if (!ids.has(c)) {
          pushIssue(
            report,
            makeIssue(
              'ara-cross-link',
              'error',
              'trace.child.missing',
              `Trace node ${nodeId} child references unknown node: ${c}`,
              { path: tracePath, ref: nodeId },
            ),
          );
        }
        if (c === nodeId) {
          pushIssue(
            report,
            makeIssue(
              'ara-cross-link',
              'error',
              'trace.child.self_reference',
              `Trace node ${nodeId} lists itself as its own child.`,
              { path: tracePath, ref: nodeId },
            ),
          );
        }
      }
    }
  }

  if (n.kind === 'branch') {
    if (typeof n.branch_id !== 'string' || n.branch_id.length === 0) {
      pushIssue(
        report,
        makeIssue(
          'ara-cross-link',
          'error',
          'trace.branch_id.missing',
          `Trace branch node ${nodeId} is missing branch_id.`,
          { path: tracePath, ref: nodeId },
        ),
      );
    } else if (!branchById.has(n.branch_id)) {
      pushIssue(
        report,
        makeIssue(
          'ara-cross-link',
          'error',
          'trace.branch_id.unresolved',
          `Trace branch node ${nodeId} branch_id does not match any curriculum branch: ${n.branch_id}`,
          { path: tracePath, ref: nodeId },
        ),
      );
    }
  } else if (typeof n.branch_id === 'string' && n.branch_id.length > 0) {
    if (!branchById.has(n.branch_id)) {
      pushIssue(
        report,
        makeIssue(
          'ara-cross-link',
          'warning',
          'trace.branch_id.unresolved',
          `Trace node ${nodeId} branch_id does not match any curriculum branch: ${n.branch_id}`,
          { path: tracePath, ref: nodeId },
        ),
      );
    }
  }
}

function validateTraceEdges(
  edgesRaw: unknown,
  ids: Set<string>,
  tracePath: string,
  report: ValidationReport,
): void {
  if (!Array.isArray(edgesRaw)) {
    pushIssue(
      report,
      makeIssue(
        'ara-cross-link',
        'error',
        'trace.edges_invalid',
        'Trace exploration_tree edges field is not an array.',
        { path: tracePath },
      ),
    );
    return;
  }
  for (let i = 0; i < edgesRaw.length; i++) {
    const e = edgesRaw[i] as TraceEdge | null;
    const label = `edge[${i}]`;
    if (!e || typeof e !== 'object') {
      pushIssue(
        report,
        makeIssue(
          'ara-cross-link',
          'error',
          'trace.edge.invalid',
          `Trace exploration_tree ${label} is not an object.`,
          { path: tracePath },
        ),
      );
      continue;
    }
    const from = e.from;
    const to = e.to;
    if (typeof from !== 'string' || from.length === 0) {
      pushIssue(
        report,
        makeIssue(
          'ara-cross-link',
          'error',
          'trace.edge.endpoint_invalid',
          `Trace ${label} has invalid "from" endpoint.`,
          { path: tracePath },
        ),
      );
    } else if (!ids.has(from)) {
      pushIssue(
        report,
        makeIssue(
          'ara-cross-link',
          'error',
          'trace.edge.endpoint_missing',
          `Trace ${label} "from" references unknown node: ${from}`,
          { path: tracePath, ref: from },
        ),
      );
    }
    if (typeof to !== 'string' || to.length === 0) {
      pushIssue(
        report,
        makeIssue(
          'ara-cross-link',
          'error',
          'trace.edge.endpoint_invalid',
          `Trace ${label} has invalid "to" endpoint.`,
          { path: tracePath },
        ),
      );
    } else if (!ids.has(to)) {
      pushIssue(
        report,
        makeIssue(
          'ara-cross-link',
          'error',
          'trace.edge.endpoint_missing',
          `Trace ${label} "to" references unknown node: ${to}`,
          { path: tracePath, ref: to },
        ),
      );
    }
    if (typeof from === 'string' && typeof to === 'string' && from === to) {
      pushIssue(
        report,
        makeIssue(
          'ara-cross-link',
          'warning',
          'trace.edge.self_loop',
          `Trace ${label} is a self-loop on node ${from}.`,
          { path: tracePath, ref: from },
        ),
      );
    }
  }
}

export async function validateAraCrossLink(loaded: LoadedPackage): Promise<ValidationReport> {
  const report = emptyReport();
  const root = loaded.root;

  // Index of all known artifact-relative refs (files only).
  const knownArtifactPaths = new Set<string>([
    ...loaded.artifact.logicFiles,
    ...loaded.artifact.srcFiles,
    ...loaded.artifact.evidencePaths,
    ...(loaded.artifact.paperMd ? [loaded.artifact.paperMd] : []),
    ...(loaded.artifact.traceTreePath ? [loaded.artifact.traceTreePath] : []),
  ]);

  // Branch ref -> path index (curriculum/branches/<file>.yaml)
  const branchByRef = new Map(loaded.branches.map((b) => [b.ref, b]));
  const branchById = new Map(loaded.branches.map((b) => [b.data.id, b]));

  // Stage ref -> stage record
  const stageByRef = new Map(loaded.stages.map((s) => [s.ref, s]));
  const stageById = new Map(loaded.stages.map((s) => [s.data.id, s]));

  // 1. Stage artifact_refs resolve to artifact files (or document refs).
  for (const stage of loaded.stages) {
    for (const ref of stage.data.artifact_refs) {
      const noFrag = stripFragment(ref);
      if (!noFrag.startsWith('artifact/')) {
        pushIssue(
          report,
          makeIssue(
            'ara-cross-link',
            'warning',
            'stage.artifact_ref.non_artifact',
            `Stage ${stage.data.id} references "${ref}" outside artifact/.`,
            { path: stage.ref, ref },
          ),
        );
        continue;
      }
      if (!knownArtifactPaths.has(noFrag)) {
        pushIssue(
          report,
          makeIssue(
            'ara-cross-link',
            'error',
            'stage.artifact_ref.missing',
            `Stage ${stage.data.id} artifact_ref does not resolve: ${ref}`,
            { path: stage.ref, ref },
          ),
        );
      }
    }
  }

  // 2. Graph nodes link to valid stages and valid branches.
  for (const node of loaded.graph.nodes) {
    const stagePath = node.stage;
    if (!stageByRef.has(stagePath) && !stageByRef.has(`curriculum/${stagePath}`)) {
      // accept either form: "stages/001..." or "curriculum/stages/..."
      const candidate = stagePath.startsWith('curriculum/')
        ? stagePath
        : path.posix.join('curriculum', stagePath);
      if (!stageByRef.has(candidate)) {
        pushIssue(
          report,
          makeIssue(
            'ara-cross-link',
            'error',
            'graph.stage.missing',
            `Graph node ${node.id} references missing stage: ${stagePath}`,
            { ref: node.id, path: stagePath },
          ),
        );
      }
    }
    if (node.choices) {
      for (const choice of node.choices) {
        const branchRef = choice.branch.startsWith('curriculum/')
          ? choice.branch
          : path.posix.join('curriculum', choice.branch);
        const altRef = choice.branch;
        if (!branchByRef.has(branchRef) && !branchByRef.has(altRef)) {
          pushIssue(
            report,
            makeIssue(
              'ara-cross-link',
              'error',
              'graph.branch.missing',
              `Graph node ${node.id} choice "${choice.id}" references missing branch: ${choice.branch}`,
              { ref: node.id, path: choice.branch },
            ),
          );
        }
      }
    }
    if (node.unlocks) {
      for (const u of node.unlocks) {
        if (!loaded.graph.nodes.some((n) => n.id === u)) {
          pushIssue(
            report,
            makeIssue(
              'ara-cross-link',
              'error',
              'graph.unlock.missing',
              `Graph node ${node.id} unlocks unknown node: ${u}`,
              { ref: node.id },
            ),
          );
        }
      }
    }
    if (node.unlocks_by_choice) {
      for (const [choiceId, targets] of Object.entries(node.unlocks_by_choice)) {
        for (const t of targets) {
          if (!loaded.graph.nodes.some((n) => n.id === t)) {
            pushIssue(
              report,
              makeIssue(
                'ara-cross-link',
                'error',
                'graph.unlock_by_choice.missing',
                `Graph node ${node.id} choice ${choiceId} unlocks unknown node: ${t}`,
                { ref: node.id },
              ),
            );
          }
        }
      }
    }
  }

  // 3. Branches: evidence required unless expert_reconstructed.
  for (const branch of loaded.branches) {
    const b = branch.data;
    if (b.support_level === 'explicit') {
      if (!b.source_refs || b.source_refs.length === 0) {
        pushIssue(
          report,
          makeIssue(
            'ara-cross-link',
            'error',
            'branch.source_refs.missing',
            `Branch ${b.id} has support_level=explicit but no source_refs.`,
            { path: branch.ref, ref: b.id },
          ),
        );
      }
    }
    if (b.support_level !== 'expert_reconstructed') {
      if (!b.evidence_refs || b.evidence_refs.length === 0) {
        pushIssue(
          report,
          makeIssue(
            'ara-cross-link',
            'error',
            'branch.evidence.missing',
            `Branch ${b.id} must cite evidence_refs unless support_level=expert_reconstructed.`,
            { path: branch.ref, ref: b.id },
          ),
        );
      } else {
        for (const ev of b.evidence_refs) {
          const noFrag = stripFragment(ev);
          if (
            noFrag.startsWith('artifact/') &&
            !knownArtifactPaths.has(noFrag)
          ) {
            pushIssue(
              report,
              makeIssue(
                'ara-cross-link',
                'error',
                'branch.evidence.unresolved',
                `Branch ${b.id} evidence_ref does not resolve: ${ev}`,
                { path: branch.ref, ref: b.id },
              ),
            );
          }
        }
      }
    }
    if (b.next_nodes) {
      for (const target of b.next_nodes) {
        if (!loaded.graph.nodes.some((n) => n.id === target)) {
          pushIssue(
            report,
            makeIssue(
              'ara-cross-link',
              'warning',
              'branch.next_node.missing',
              `Branch ${b.id} next_nodes references unknown graph node: ${target}`,
              { path: branch.ref, ref: b.id },
            ),
          );
        }
      }
    }
  }

  // 4. Trace exploration_tree: id uniqueness, per-node refs/parents/children/
  //    branch_id, top-level edges, and 1:1 trace↔curriculum branch mapping.
  if (loaded.artifact.traceTreePath) {
    const traceAbs = path.join(root, loaded.artifact.traceTreePath);
    if (await pathExists(traceAbs)) {
      try {
        const text = await fs.readFile(traceAbs, 'utf8');
        const raw = yaml.load(text);
        const nodes = flattenTraceNodes(raw);
        const ids = new Set<string>();
        // First pass: collect ids and flag duplicates / missing ids.
        for (const n of nodes) {
          if (typeof n.id !== 'string' || n.id.length === 0) {
            pushIssue(
              report,
              makeIssue(
                'ara-cross-link',
                'error',
                'trace.node.id_invalid',
                'Trace exploration_tree node missing id.',
                { path: loaded.artifact.traceTreePath },
              ),
            );
            continue;
          }
          if (ids.has(n.id)) {
            pushIssue(
              report,
              makeIssue(
                'ara-cross-link',
                'error',
                'trace.node.duplicate_id',
                `Trace exploration_tree has duplicate node id: ${n.id}`,
                { path: loaded.artifact.traceTreePath, ref: n.id },
              ),
            );
          }
          ids.add(n.id);
        }
        // Second pass: validate per-node fields against the id index.
        for (const n of nodes) {
          if (typeof n.id !== 'string' || n.id.length === 0) continue;
          validateTraceNode(
            n,
            ids,
            knownArtifactPaths,
            branchById,
            loaded.artifact.traceTreePath,
            report,
          );
        }
        // Validate top-level edges if present.
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          const edgesRaw = (raw as { edges?: unknown }).edges;
          if (edgesRaw !== undefined && edgesRaw !== null) {
            validateTraceEdges(
              edgesRaw,
              ids,
              loaded.artifact.traceTreePath,
              report,
            );
          }
        }
        // Third pass: trace branch nodes and curriculum branches must form a
        // 1:1 mapping on branch_id so the two artifacts stay aligned on the
        // same id convention.
        const branchIdToTraceNode = new Map<string, string>();
        for (const n of nodes) {
          if (n.kind !== 'branch') continue;
          if (typeof n.id !== 'string' || n.id.length === 0) continue;
          if (typeof n.branch_id !== 'string' || n.branch_id.length === 0) {
            continue;
          }
          if (!branchById.has(n.branch_id)) continue;
          const prior = branchIdToTraceNode.get(n.branch_id);
          if (prior !== undefined) {
            pushIssue(
              report,
              makeIssue(
                'ara-cross-link',
                'error',
                'trace.branch_id.duplicate',
                `Trace nodes ${prior} and ${n.id} both claim branch_id ${n.branch_id}; each curriculum branch must map to exactly one trace branch node.`,
                { path: loaded.artifact.traceTreePath, ref: n.branch_id },
              ),
            );
          } else {
            branchIdToTraceNode.set(n.branch_id, n.id);
          }
        }
        for (const branchId of branchById.keys()) {
          if (!branchIdToTraceNode.has(branchId)) {
            pushIssue(
              report,
              makeIssue(
                'ara-cross-link',
                'warning',
                'trace.branch.unmapped',
                `Curriculum branch ${branchId} has no corresponding trace branch node (kind: branch with matching branch_id).`,
                { path: loaded.artifact.traceTreePath, ref: branchId },
              ),
            );
          }
        }
      } catch (err) {
        pushIssue(
          report,
          makeIssue(
            'ara-cross-link',
            'error',
            'trace.parse_error',
            `Failed to parse exploration_tree.yaml: ${String(err)}`,
            { path: loaded.artifact.traceTreePath },
          ),
        );
      }
    }
  }

  // 5. Stages reference rubrics/hints that resolve.
  const rubricByRef = new Map(loaded.rubrics.map((r) => [r.ref, r]));
  const hintsByRef = new Map(loaded.hints.map((h) => [h.ref, h]));
  for (const stage of loaded.stages) {
    const rubricRef = stage.data.stage_policy.validation.rubric;
    if (rubricRef) {
      if (!rubricByRef.has(rubricRef)) {
        pushIssue(
          report,
          makeIssue(
            'ara-cross-link',
            'error',
            'stage.rubric.missing',
            `Stage ${stage.data.id} references missing rubric: ${rubricRef}`,
            { path: stage.ref, ref: stage.data.id },
          ),
        );
      }
    }
    const hintsRef = stage.data.stage_policy.hints?.progressive;
    if (hintsRef) {
      if (!hintsByRef.has(hintsRef)) {
        pushIssue(
          report,
          makeIssue(
            'ara-cross-link',
            'warning',
            'stage.hints.missing',
            `Stage ${stage.data.id} references missing hints file: ${hintsRef}`,
            { path: stage.ref, ref: stage.data.id },
          ),
        );
      }
    }
  }

  // Touch unused indexes to make later expansion convenient.
  void stageById;

  return finalize(report);
}
