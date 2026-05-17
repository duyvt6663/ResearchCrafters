import { describe, expect, it } from 'vitest';

import { mentorRefusalsSchema } from '@researchcrafters/erp-schema';

import {
  MENTOR_REFUSAL_SCOPES,
  getAuthoredRefusal,
  platformDefaultRefusals,
  type MentorRefusalScope,
} from '../src/refusal.js';

describe('getAuthoredRefusal', () => {
  it('returns a non-placeholder default for every scope', () => {
    for (const scope of MENTOR_REFUSAL_SCOPES) {
      const refusal = getAuthoredRefusal({ scope });
      expect(refusal.scope).toBe(scope);
      expect(refusal.title.length).toBeGreaterThan(0);
      expect(refusal.body.length).toBeGreaterThan(0);
      expect(refusal.hint.length).toBeGreaterThan(0);
      // Guard against the legacy stub copy that this work replaces.
      expect(refusal.title.toLowerCase()).not.toContain('placeholder');
      expect(refusal.body.toLowerCase()).not.toContain('placeholder');
    }
  });

  it('substitutes packageTitle into scopes that personalise', () => {
    const personalised: MentorRefusalScope[] = [
      'solution_request',
      'out_of_context',
      'policy_block',
    ];
    for (const scope of personalised) {
      const refusal = getAuthoredRefusal({ scope, packageTitle: 'ResNet' });
      expect(refusal.body).toContain('ResNet');
    }
  });

  it('falls back to the generic title when packageTitle is empty', () => {
    const refusal = getAuthoredRefusal({
      scope: 'solution_request',
      packageTitle: '   ',
    });
    expect(refusal.body).toContain('this package');
  });

  it('prefers per-package authored copy over the platform default', () => {
    const overrides = mentorRefusalsSchema.parse({
      solution_request: {
        title: 'No answer here.',
        body: 'Try the rubric instead.',
        hint: 'Open Evidence tab.',
      },
    });
    const refusal = getAuthoredRefusal({
      scope: 'solution_request',
      packageTitle: 'ResNet',
      authoredOverrides: overrides,
    });
    expect(refusal.title).toBe('No answer here.');
    expect(refusal.body).toBe('Try the rubric instead.');
    expect(refusal.hint).toBe('Open Evidence tab.');
  });

  it('falls back to platform-default hint when override omits it', () => {
    const overrides = mentorRefusalsSchema.parse({
      policy_block: {
        title: 'Blocked.',
        body: 'Try later.',
      },
    });
    const refusal = getAuthoredRefusal({
      scope: 'policy_block',
      packageTitle: 'ResNet',
      authoredOverrides: overrides,
    });
    expect(refusal.title).toBe('Blocked.');
    expect(refusal.body).toBe('Try later.');
    // Hint comes from the platform default builder, personalised with the
    // package title where applicable.
    const defaultRefusal = platformDefaultRefusals('ResNet').policy_block;
    expect(refusal.hint).toBe(defaultRefusal.hint);
  });

  it('falls through to the default for scopes the package did not override', () => {
    const overrides = mentorRefusalsSchema.parse({
      solution_request: {
        title: 'X',
        body: 'Y',
      },
    });
    const refusal = getAuthoredRefusal({
      scope: 'budget_cap',
      authoredOverrides: overrides,
    });
    expect(refusal).toEqual(platformDefaultRefusals().budget_cap);
  });

  it('rejects malformed authored overrides at the schema boundary', () => {
    expect(() =>
      mentorRefusalsSchema.parse({
        solution_request: { title: '', body: 'something' },
      }),
    ).toThrow();
    expect(() =>
      mentorRefusalsSchema.parse({
        unknown_scope: { title: 't', body: 'b' },
      }),
    ).toThrow();
  });
});
