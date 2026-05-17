import { describe, expect, it } from 'vitest';
import type { StagePolicy } from '@researchcrafters/erp-schema';
import { buildMentorContext } from '../src/context-builder.js';
import {
  InMemoryMentorContextCache,
  fnv1aDigest,
  mentorContextCacheKey,
} from '../src/context-cache.js';

function makePolicy(): StagePolicy {
  return {
    mentor_visibility: {
      stage_copy: 'always',
      artifact_refs: 'always',
      rubric: 'after_attempt',
      evidence: 'after_attempt',
      branch_feedback: 'after_pass',
      canonical_solution: 'after_completion',
      branch_solutions: 'after_completion',
    },
    runner: { mode: 'none' },
    validation: { kind: 'rubric' },
    inputs: { mode: 'free_text' },
    pass_threshold: 0.7,
    feedback: {},
    mentor_redaction_targets: ['CANONICAL_KEY'],
  };
}

function makeLoaders() {
  const calls = { artifact: 0, rubric: 0, branch: 0 };
  return {
    calls,
    loaders: {
      artifactRefs: ['paper/section-1', 'paper/section-2'] as const,
      loadArtifact: async (ref: string) => {
        calls.artifact++;
        return { ref, text: `text for ${ref}` };
      },
      loadRubricCriteria: async () => {
        calls.rubric++;
        return ['criterion A', 'criterion B'];
      },
      loadBranchFeedback: async () => {
        calls.branch++;
        return [{ branchId: 'B1', text: 'fb 1' }];
      },
    },
  };
}

const visibility = {
  hasAttempt: true,
  hasPassed: false,
  hasCompletedPackage: false,
};

describe('InMemoryMentorContextCache', () => {
  it('returns undefined for an unknown key', () => {
    const cache = new InMemoryMentorContextCache();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('expires entries past their TTL', () => {
    let now = 1_000;
    const cache = new InMemoryMentorContextCache({ ttlMs: 100, now: () => now });
    cache.set('k', { stageId: 'S' } as never);
    expect(cache.get('k')).toBeDefined();
    now += 101;
    expect(cache.get('k')).toBeUndefined();
    // Expired entry was dropped from the underlying map.
    expect(cache.size()).toBe(0);
  });

  it('evicts the oldest entry when maxEntries is reached', () => {
    const cache = new InMemoryMentorContextCache({ maxEntries: 2, ttlMs: 60_000 });
    cache.set('a', { id: 'a' } as never);
    cache.set('b', { id: 'b' } as never);
    cache.set('c', { id: 'c' } as never);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('re-inserting a key refreshes its insertion order', () => {
    const cache = new InMemoryMentorContextCache({ maxEntries: 2, ttlMs: 60_000 });
    cache.set('a', { id: 'a' } as never);
    cache.set('b', { id: 'b' } as never);
    cache.set('a', { id: 'a2' } as never);
    cache.set('c', { id: 'c' } as never);
    // 'b' was the oldest after refreshing 'a', so it should be evicted.
    expect(cache.get('a')).toEqual({ id: 'a2' });
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeDefined();
  });
});

describe('mentorContextCacheKey', () => {
  it('is stable under artifact ref reordering', () => {
    const a = mentorContextCacheKey({
      stageId: 'S1',
      packageVersionId: 'pv1',
      visibilityState: visibility,
      artifactRefs: ['x', 'y'],
      policyDigest: 'd',
    });
    const b = mentorContextCacheKey({
      stageId: 'S1',
      packageVersionId: 'pv1',
      visibilityState: visibility,
      artifactRefs: ['y', 'x'],
      policyDigest: 'd',
    });
    expect(a).toBe(b);
  });

  it('separates keys by visibility state', () => {
    const before = mentorContextCacheKey({
      stageId: 'S1',
      packageVersionId: 'pv1',
      visibilityState: { hasAttempt: false, hasPassed: false, hasCompletedPackage: false },
      artifactRefs: ['x'],
      policyDigest: 'd',
    });
    const after = mentorContextCacheKey({
      stageId: 'S1',
      packageVersionId: 'pv1',
      visibilityState: { hasAttempt: true, hasPassed: true, hasCompletedPackage: false },
      artifactRefs: ['x'],
      policyDigest: 'd',
    });
    expect(before).not.toBe(after);
  });
});

describe('fnv1aDigest', () => {
  it('is deterministic and key-order independent', () => {
    const a = fnv1aDigest({ a: 1, b: [2, 3] });
    const b = fnv1aDigest({ b: [2, 3], a: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it('differs for different inputs', () => {
    expect(fnv1aDigest({ a: 1 })).not.toBe(fnv1aDigest({ a: 2 }));
  });
});

describe('buildMentorContext with cache', () => {
  it('skips loaders on a cache hit', async () => {
    const cache = new InMemoryMentorContextCache();
    const harness = makeLoaders();
    const policy = makePolicy();

    const first = await buildMentorContext({
      stageId: 'S1',
      attempt: 1,
      packageVersionId: 'pv1',
      stagePolicy: policy,
      visibilityState: visibility,
      cache,
      loaders: harness.loaders,
    });
    expect(harness.calls.artifact).toBe(2);
    expect(harness.calls.rubric).toBe(1);

    const second = await buildMentorContext({
      stageId: 'S1',
      attempt: 2,
      packageVersionId: 'pv1',
      stagePolicy: policy,
      visibilityState: visibility,
      cache,
      loaders: harness.loaders,
    });

    // Hit means loaders were not re-invoked.
    expect(harness.calls.artifact).toBe(2);
    expect(harness.calls.rubric).toBe(1);

    // Loader-derived fields match the first call (cache returned same bytes).
    expect(second.artifactExcerpts).toEqual(first.artifactExcerpts);
    expect(second.rubricCriteria).toEqual(first.rubricCriteria);

    // `attempt` is request-scoped — must reflect the current request, not the
    // value that was hashed into the cache key.
    expect(second.attempt).toBe(2);
    expect(first.attempt).toBe(1);
  });

  it('misses when visibility state changes', async () => {
    const cache = new InMemoryMentorContextCache();
    const harness = makeLoaders();
    const policy = makePolicy();

    await buildMentorContext({
      stageId: 'S1',
      attempt: 1,
      packageVersionId: 'pv1',
      stagePolicy: policy,
      visibilityState: { hasAttempt: false, hasPassed: false, hasCompletedPackage: false },
      cache,
      loaders: harness.loaders,
    });
    const beforePass = { ...harness.calls };

    await buildMentorContext({
      stageId: 'S1',
      attempt: 1,
      packageVersionId: 'pv1',
      stagePolicy: policy,
      visibilityState: { hasAttempt: true, hasPassed: true, hasCompletedPackage: false },
      cache,
      loaders: harness.loaders,
    });
    // Different visibility → fresh load.
    expect(harness.calls.artifact).toBeGreaterThan(beforePass.artifact);
  });

  it('misses when the policy digest changes', async () => {
    const cache = new InMemoryMentorContextCache();
    const harness = makeLoaders();
    const policy = makePolicy();
    const altered: StagePolicy = {
      ...policy,
      mentor_redaction_targets: ['OTHER_KEY'],
    };

    await buildMentorContext({
      stageId: 'S1',
      attempt: 1,
      packageVersionId: 'pv1',
      stagePolicy: policy,
      visibilityState: visibility,
      cache,
      loaders: harness.loaders,
    });
    const before = harness.calls.artifact;

    await buildMentorContext({
      stageId: 'S1',
      attempt: 1,
      packageVersionId: 'pv1',
      stagePolicy: altered,
      visibilityState: visibility,
      cache,
      loaders: harness.loaders,
    });
    expect(harness.calls.artifact).toBeGreaterThan(before);
  });

  it('honours an explicit policyDigest override', async () => {
    const cache = new InMemoryMentorContextCache();
    const harness = makeLoaders();
    const policy = makePolicy();

    await buildMentorContext({
      stageId: 'S1',
      attempt: 1,
      packageVersionId: 'pv1',
      stagePolicy: policy,
      visibilityState: visibility,
      cache,
      policyDigest: 'fixed-digest-v1',
      loaders: harness.loaders,
    });
    const before = harness.calls.artifact;

    // Same digest → hit even though we recreate the policy object identity.
    await buildMentorContext({
      stageId: 'S1',
      attempt: 1,
      packageVersionId: 'pv1',
      stagePolicy: { ...policy },
      visibilityState: visibility,
      cache,
      policyDigest: 'fixed-digest-v1',
      loaders: harness.loaders,
    });
    expect(harness.calls.artifact).toBe(before);

    // Different digest → miss.
    await buildMentorContext({
      stageId: 'S1',
      attempt: 1,
      packageVersionId: 'pv1',
      stagePolicy: policy,
      visibilityState: visibility,
      cache,
      policyDigest: 'fixed-digest-v2',
      loaders: harness.loaders,
    });
    expect(harness.calls.artifact).toBeGreaterThan(before);
  });

  it('without a cache, every call loads fresh', async () => {
    const harness = makeLoaders();
    const policy = makePolicy();

    await buildMentorContext({
      stageId: 'S1',
      attempt: 1,
      packageVersionId: 'pv1',
      stagePolicy: policy,
      visibilityState: visibility,
      loaders: harness.loaders,
    });
    await buildMentorContext({
      stageId: 'S1',
      attempt: 1,
      packageVersionId: 'pv1',
      stagePolicy: policy,
      visibilityState: visibility,
      loaders: harness.loaders,
    });
    expect(harness.calls.artifact).toBe(4);
    expect(harness.calls.rubric).toBe(2);
  });
});
