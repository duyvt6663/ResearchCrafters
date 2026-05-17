import { describe, expect, it } from 'vitest';
import {
  patchOverlaySchema,
  validatePatchOverlay,
} from '../src/index.js';

describe('patchOverlaySchema (cosmetic-only contract)', () => {
  it('accepts an empty overlay payload', () => {
    expect(patchOverlaySchema.parse({})).toEqual({});
  });

  it('accepts a package-level cosmetic overlay', () => {
    const overlay = {
      package: {
        title: 'Flash Attention — Visual Tour',
        description: 'Refreshed catalog blurb',
        skills: ['transformers', 'attention'],
        estimated_time_minutes: 45,
      },
    };
    expect(patchOverlaySchema.parse(overlay)).toEqual(overlay);
  });

  it('accepts a stage-level cosmetic overlay', () => {
    const overlay = {
      stages: {
        S001: {
          title: 'Warm-up (revised copy)',
          description: 'Clearer intro paragraph.',
          narrative: 'Story-mode framing.',
        },
      },
    };
    expect(patchOverlaySchema.parse(overlay)).toEqual(overlay);
  });

  it('rejects unknown top-level keys', () => {
    const res = validatePatchOverlay({ graph: { nodes: [] } });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.startsWith('<root>') || e.includes('graph'))).toBe(true);
  });

  it('rejects structural changes hidden inside a stage overlay', () => {
    const res = validatePatchOverlay({
      stages: {
        S001: { pass_threshold: 0.5 },
      },
    });
    expect(res.valid).toBe(false);
    expect(res.errors.join('\n')).toMatch(/stages\.S001/);
  });

  it('rejects rubric changes', () => {
    const res = validatePatchOverlay({ rubric: { dimensions: [] } });
    expect(res.valid).toBe(false);
  });

  it('rejects runner changes', () => {
    const res = validatePatchOverlay({ runner: { mode: 'live' } });
    expect(res.valid).toBe(false);
  });

  it('rejects branch / solution changes', () => {
    const res = validatePatchOverlay({
      branches: { B001: { type: 'canonical' } },
      solution: 'spoiler',
    });
    expect(res.valid).toBe(false);
  });

  it('rejects stage_policy changes hidden under stages', () => {
    const res = validatePatchOverlay({
      stages: {
        S001: { stage_policy: { pass_threshold: 0.9 } },
      },
    });
    expect(res.valid).toBe(false);
  });

  it('rejects empty-string copy (catches accidental clearing)', () => {
    const res = validatePatchOverlay({
      package: { title: '' },
    });
    expect(res.valid).toBe(false);
  });

  it('rejects negative estimated_time_minutes', () => {
    const res = validatePatchOverlay({
      package: { estimated_time_minutes: -1 },
    });
    expect(res.valid).toBe(false);
  });

  it('returns parsed data when valid for downstream consumers', () => {
    const overlay = {
      package: { title: 'New title' },
      stages: { S002: { narrative: 'New narrative.' } },
    };
    const res = validatePatchOverlay(overlay);
    expect(res.valid).toBe(true);
    expect(res.data).toEqual(overlay);
    expect(res.errors).toEqual([]);
  });

  it('error messages include the JSON path so authors can locate the field', () => {
    const res = validatePatchOverlay({
      stages: { S001: { rubric: { dimensions: [] } } },
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.startsWith('stages.S001'))).toBe(true);
  });
});
