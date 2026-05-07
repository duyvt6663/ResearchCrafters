import type { LoadedPackage, PackageBuildManifest } from './types.js';

export function buildPackageManifest(loaded: LoadedPackage): PackageBuildManifest {
  const stageRefById = new Map(loaded.stages.map((s) => [s.data.id, s.ref]));

  const graphNodes: PackageBuildManifest['graphNodes'] = loaded.graph.nodes.map((node) => {
    const stageRef =
      stageRefById.get(node.stage) ??
      [...stageRefById.values()].find((r) => r.endsWith(node.stage)) ??
      null;
    return {
      id: node.id,
      type: node.type,
      title: node.title,
      stagePath: node.stage,
      stageRef,
      artifactRefs: node.artifact_refs ?? [],
      unlocks: node.unlocks ?? [],
      unlocksByChoice: node.unlocks_by_choice ?? {},
      choices: (node.choices ?? []).map((c) => ({ id: c.id, branchRef: c.branch })),
    };
  });

  const stages: PackageBuildManifest['stages'] = loaded.stages.map((s) => {
    const out: PackageBuildManifest['stages'][number] = {
      id: s.data.id,
      ref: s.ref,
      type: s.data.type,
      title: s.data.title,
      difficulty: s.data.difficulty,
      estimatedMinutes: s.data.estimated_time_minutes,
      runnerMode: s.data.stage_policy.runner.mode,
      validationKind: s.data.stage_policy.validation.kind,
      inputMode: s.data.stage_policy.inputs.mode,
      artifactRefs: s.data.artifact_refs,
    };
    if (s.data.stage_policy.validation.rubric !== undefined) {
      out.rubricRef = s.data.stage_policy.validation.rubric;
    }
    if (s.data.stage_policy.hints?.progressive !== undefined) {
      out.hintsRef = s.data.stage_policy.hints.progressive;
    }
    if (s.data.stage_policy.pass_threshold !== undefined) {
      out.passThreshold = s.data.stage_policy.pass_threshold;
    }
    return out;
  });

  const branches: PackageBuildManifest['branches'] = loaded.branches.map((b) => ({
    id: b.data.id,
    ref: b.ref,
    type: b.data.type,
    supportLevel: b.data.support_level,
    choice: b.data.choice,
    evidenceRefs: b.data.evidence_refs ?? [],
    sourceRefs: b.data.source_refs ?? [],
    nextNodes: b.data.next_nodes ?? [],
  }));

  const rubrics: PackageBuildManifest['rubrics'] = loaded.rubrics.map((r) => ({
    id: r.data.id,
    ref: r.ref,
    passThreshold: r.data.pass_threshold,
    dimensionCount: r.data.dimensions.length,
  }));

  const fixtures: PackageBuildManifest['fixtures'] = [];
  if (loaded.runner) {
    for (const [stageRef, stageRunner] of Object.entries(loaded.runner.stages)) {
      for (const f of stageRunner.fixtures ?? []) {
        fixtures.push({ stageRef, path: f.path, sha256: f.sha256 });
      }
    }
  }

  return {
    package: {
      slug: loaded.package.slug,
      title: loaded.package.title,
      version: loaded.package.version,
      status: loaded.package.status,
      difficulty: loaded.package.difficulty,
      estimated_time_minutes: loaded.package.estimated_time_minutes,
      paper: loaded.package.paper,
    },
    graphNodes,
    stages,
    branches,
    rubrics,
    fixtures,
  };
}
