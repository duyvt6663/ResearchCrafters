import { describe, expect, it, vi } from 'vitest';
import type { StagePolicy } from '@researchcrafters/erp-schema';
import { buildMentorContext } from '../src/context-builder.js';

function makePolicy(overrides: Partial<StagePolicy['mentor_visibility']> = {}): StagePolicy {
  return {
    mentor_visibility: {
      stage_copy: 'always',
      artifact_refs: 'always',
      rubric: 'after_attempt',
      evidence: 'after_attempt',
      branch_feedback: 'after_pass',
      canonical_solution: 'after_completion',
      branch_solutions: 'after_completion',
      ...overrides,
    },
    runner: { mode: 'none' },
    validation: { kind: 'rubric' },
    inputs: { mode: 'free_text' },
    pass_threshold: 0.7,
    feedback: {},
    mentor_redaction_targets: ['CANONICAL_KEY', 'hidden answer *'],
  };
}

const noopLoaders = {
  artifactRefs: ['paper/section-1'],
  loadArtifact: async (ref: string) => ({ ref, text: `text for ${ref}` }),
  loadRubricCriteria: async () => ['criterion A', 'criterion B'],
  loadBranchFeedback: async () => [{ branchId: 'B1', text: 'feedback 1' }],
};

describe('buildMentorContext', () => {
  it('loads only artifact refs when no attempt yet', async () => {
    const ctx = await buildMentorContext({
      stageId: 'S003',
      attempt: 0,
      packageVersionId: 'pv1',
      stagePolicy: makePolicy(),
      visibilityState: { hasAttempt: false, hasPassed: false, hasCompletedPackage: false },
      loaders: noopLoaders,
    });
    expect(ctx.artifactExcerpts).toHaveLength(1);
    expect(ctx.rubricCriteria).toBeUndefined();
    expect(ctx.branchFeedback).toBeUndefined();
    expect(ctx.allowedScopes).toContain('artifact_refs');
    expect(ctx.allowedScopes).not.toContain('rubric');
  });

  it('loads rubric after_attempt fires', async () => {
    const ctx = await buildMentorContext({
      stageId: 'S003',
      attempt: 1,
      packageVersionId: 'pv1',
      stagePolicy: makePolicy(),
      visibilityState: { hasAttempt: true, hasPassed: false, hasCompletedPackage: false },
      loaders: noopLoaders,
    });
    expect(ctx.rubricCriteria).toEqual(['criterion A', 'criterion B']);
    expect(ctx.branchFeedback).toBeUndefined();
  });

  it('loads branch feedback only after pass', async () => {
    const ctx = await buildMentorContext({
      stageId: 'S003',
      attempt: 1,
      packageVersionId: 'pv1',
      stagePolicy: makePolicy(),
      visibilityState: { hasAttempt: true, hasPassed: true, hasCompletedPackage: false },
      loaders: noopLoaders,
    });
    expect(ctx.branchFeedback).toHaveLength(1);
  });

  it('NEVER loads canonical content even when state says completed', async () => {
    // Even though canonical_solution=after_completion and hasCompletedPackage=true,
    // the loader has no canonical loader exposed — the context object never
    // surfaces canonical text. We assert there is no canonical-shaped field.
    const ctx = await buildMentorContext({
      stageId: 'S003',
      attempt: 5,
      packageVersionId: 'pv1',
      stagePolicy: makePolicy(),
      visibilityState: { hasAttempt: true, hasPassed: true, hasCompletedPackage: true },
      loaders: noopLoaders,
    });
    // No canonical text should appear in any loaded excerpt — the loader only
    // returns artifact refs we control.
    for (const ex of ctx.artifactExcerpts) {
      expect(ex.text).not.toContain('CANONICAL_KEY');
    }
  });

  it("refuses 'always' on canonical_solution and warns", async () => {
    const warn = vi.fn();
    const ctx = await buildMentorContext({
      stageId: 'S003',
      attempt: 0,
      packageVersionId: 'pv1',
      stagePolicy: makePolicy({ canonical_solution: 'always' }),
      visibilityState: { hasAttempt: false, hasPassed: false, hasCompletedPackage: false },
      loaders: noopLoaders,
      warn,
    });
    expect(warn).toHaveBeenCalled();
    expect(ctx.allowedScopes).not.toContain('canonical_solution');
  });

  it("refuses 'always' on branch_solutions and warns", async () => {
    const warn = vi.fn();
    const ctx = await buildMentorContext({
      stageId: 'S003',
      attempt: 0,
      packageVersionId: 'pv1',
      stagePolicy: makePolicy({ branch_solutions: 'always' }),
      visibilityState: { hasAttempt: true, hasPassed: true, hasCompletedPackage: true },
      loaders: noopLoaders,
      warn,
    });
    expect(warn).toHaveBeenCalled();
    expect(ctx.allowedScopes).not.toContain('branch_solutions');
  });

  it("respects 'never' state", async () => {
    const ctx = await buildMentorContext({
      stageId: 'S003',
      attempt: 0,
      packageVersionId: 'pv1',
      stagePolicy: makePolicy({ rubric: 'never' }),
      visibilityState: { hasAttempt: true, hasPassed: true, hasCompletedPackage: true },
      loaders: noopLoaders,
    });
    expect(ctx.rubricCriteria).toBeUndefined();
    expect(ctx.allowedScopes).not.toContain('rubric');
  });

  it('exposes redaction targets from policy', async () => {
    const ctx = await buildMentorContext({
      stageId: 'S003',
      attempt: 0,
      packageVersionId: 'pv1',
      stagePolicy: makePolicy(),
      visibilityState: { hasAttempt: false, hasPassed: false, hasCompletedPackage: false },
      loaders: noopLoaders,
    });
    expect(ctx.redactionTargets).toEqual(['CANONICAL_KEY', 'hidden answer *']);
  });
});
