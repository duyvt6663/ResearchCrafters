import { describe, expect, it } from 'vitest';
import {
  checkWritingClaim,
  checkWritingClaimBatch,
  enforceCitationPolicy,
  extractCitationRefs,
  flagForbiddenClaims,
} from '../src/index.js';
import type {
  WritingClaimPolicy,
  WritingClaimSpec,
} from '../src/index.js';
import {
  RESNET_ALLOWED_EVIDENCE,
  RESNET_FORBIDDEN_CLAIMS,
  RESNET_WRITING_EXAMPLES,
} from './fixtures/resnet-writing-examples.js';

const policy: WritingClaimPolicy = {
  allowedEvidenceRefs: [
    'evidence/tables/training-curves.md',
    'artifact/figures/loss.png',
    'E1',
  ],
};

describe('checkWritingClaim', () => {
  it('flags a claim with no citation as no_citation', () => {
    const spec: WritingClaimSpec = {
      id: 'c1',
      text: 'ResNet-50 outperforms ResNet-34 by a wide margin.',
    };
    const r = checkWritingClaim(spec, policy);
    expect(r.passed).toBe(false);
    expect(r.flagged).toBe(true);
    expect(r.reason).toBe('no_citation');
    expect(r.acceptedRefs).toEqual([]);
    expect(r.note).toMatch(/unsupported claim/);
  });

  it('passes a claim cited against an allowed evidence ref', () => {
    const r = checkWritingClaim(
      { id: 'c2', text: 'Loss curves are stable.', citedRefs: ['E1'] },
      policy,
    );
    expect(r.passed).toBe(true);
    expect(r.flagged).toBe(false);
    expect(r.reason).toBeUndefined();
    expect(r.acceptedRefs).toEqual(['E1']);
  });

  it('fails when the cited ref is not on the allow-list', () => {
    const r = checkWritingClaim(
      {
        id: 'c3',
        text: 'Layer norm is unnecessary.',
        citedRefs: ['paper://outside.pdf#sec3'],
      },
      policy,
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('disallowed_citation');
    expect(r.disallowedRefs).toEqual(['paper://outside.pdf#sec3']);
    expect(r.acceptedRefs).toEqual([]);
  });

  it('still fails on a mix of allowed and disallowed refs (unauthorized wins)', () => {
    const r = checkWritingClaim(
      {
        id: 'c4',
        text: 'Mixed evidence.',
        citedRefs: ['E1', 'paper://outside.pdf'],
      },
      policy,
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('disallowed_citation');
    expect(r.acceptedRefs).toEqual(['E1']);
    expect(r.disallowedRefs).toEqual(['paper://outside.pdf']);
  });

  it('flags but passes a placeholder citation when the stage allows placeholders', () => {
    const placeholderPolicy: WritingClaimPolicy = {
      ...policy,
      placeholderTokens: ['<TBD>'],
      placeholderAllowed: true,
    };
    const r = checkWritingClaim(
      { id: 'c5', text: 'Draft claim.', citedRefs: ['<TBD>'] },
      placeholderPolicy,
    );
    expect(r.passed).toBe(true);
    expect(r.flagged).toBe(true);
    expect(r.reason).toBeUndefined();
    expect(r.placeholderRefs).toEqual(['<TBD>']);
  });

  it('rejects placeholders when the stage does not allow them', () => {
    const r = checkWritingClaim(
      { id: 'c6', text: 'Draft claim.', citedRefs: ['<TBD>'] },
      { ...policy, placeholderTokens: ['<TBD>'], placeholderAllowed: false },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('placeholder_disallowed');
    expect(r.placeholderRefs).toEqual(['<TBD>']);
  });

  it('honors per-claim requiresCitation=false (e.g. background framing)', () => {
    const r = checkWritingClaim(
      {
        id: 'c7',
        text: 'Deep learning has seen rapid growth since 2012.',
        requiresCitation: false,
      },
      policy,
    );
    expect(r.passed).toBe(true);
    expect(r.flagged).toBe(false);
    expect(r.reason).toBeUndefined();
  });

  it('flags an allowed + placeholder combination as passing-but-flagged', () => {
    const placeholderPolicy: WritingClaimPolicy = {
      ...policy,
      placeholderTokens: ['<TBD>'],
      placeholderAllowed: true,
    };
    const r = checkWritingClaim(
      {
        id: 'c8',
        text: 'Half-supported claim.',
        citedRefs: ['E1', '<TBD>'],
      },
      placeholderPolicy,
    );
    expect(r.passed).toBe(true);
    expect(r.flagged).toBe(true);
    expect(r.acceptedRefs).toEqual(['E1']);
    expect(r.placeholderRefs).toEqual(['<TBD>']);
  });

  it('returns spec_invalid for missing id or text', () => {
    expect(checkWritingClaim({ id: '', text: 'x' }, policy).reason).toBe(
      'spec_invalid',
    );
    expect(
      checkWritingClaim({ id: 'c9', text: '' } as WritingClaimSpec, policy).reason,
    ).toBe('spec_invalid');
  });

  it('de-duplicates repeated citations in input', () => {
    const r = checkWritingClaim(
      { id: 'c10', text: 'Doubled.', citedRefs: ['E1', 'E1'] },
      policy,
    );
    expect(r.passed).toBe(true);
    expect(r.acceptedRefs).toEqual(['E1']);
  });
});

describe('checkWritingClaimBatch', () => {
  it('aggregates per-claim verdicts into batch totals', () => {
    const batch = checkWritingClaimBatch(
      [
        { id: 'c1', text: 'cited', citedRefs: ['E1'] },
        { id: 'c2', text: 'uncited' },
        { id: 'c3', text: 'bad', citedRefs: ['paper://x'] },
      ],
      policy,
    );
    expect(batch.total).toBe(3);
    expect(batch.passed).toBe(1);
    expect(batch.failed).toBe(2);
    expect(batch.flagged).toBe(2);
    expect(batch.results[1].reason).toBe('no_citation');
    expect(batch.results[2].reason).toBe('disallowed_citation');
  });
});

describe('enforceCitationPolicy', () => {
  const allowedPolicy: WritingClaimPolicy = {
    allowedEvidenceRefs: ['E1', 'E2'],
  };
  const placeholderPolicy: WritingClaimPolicy = {
    allowedEvidenceRefs: ['E1'],
    placeholderTokens: ['<TBD>'],
    placeholderAllowed: true,
  };

  it('defaults to strict and passes when every claim is allowed', () => {
    const r = enforceCitationPolicy(
      [
        { id: 'c1', text: 'a', citedRefs: ['E1'] },
        { id: 'c2', text: 'b', citedRefs: ['E2'] },
      ],
      allowedPolicy,
    );
    expect(r.mode).toBe('strict');
    expect(r.verdict).toBe('passed');
    expect(r.batch.failed).toBe(0);
    expect(r.refusalReason).toBeUndefined();
    expect(r.summary).toMatch(/all 2 claim/);
  });

  it('returns failed verdict with refusal payload when strict and any claim fails', () => {
    const r = enforceCitationPolicy(
      [
        { id: 'c1', text: 'cited', citedRefs: ['E1'] },
        { id: 'c2', text: 'uncited' },
        { id: 'c3', text: 'bad', citedRefs: ['paper://outside'] },
      ],
      allowedPolicy,
      { mode: 'strict' },
    );
    expect(r.verdict).toBe('failed');
    expect(r.refusalReason).toBe('citation_policy_violation');
    expect(r.refusalMessage).toContain('Citation policy violated');
    expect(r.refusalMessage).toContain('no_citation');
    expect(r.refusalMessage).toContain('disallowed_citation');
    expect(r.batch.failed).toBe(2);
  });

  it('stays passed in flag mode even when some claims fail', () => {
    const r = enforceCitationPolicy(
      [
        { id: 'c1', text: 'cited', citedRefs: ['E1'] },
        { id: 'c2', text: 'uncited' },
      ],
      allowedPolicy,
      { mode: 'flag' },
    );
    expect(r.verdict).toBe('passed');
    expect(r.refusalReason).toBeUndefined();
    expect(r.summary).toContain('1 failing');
    expect(r.summary).toContain('no_citation');
  });

  it('treats placeholder-only claims as passing when the stage allows them, but still surfaces them', () => {
    const r = enforceCitationPolicy(
      [
        { id: 'c1', text: 'draft', citedRefs: ['<TBD>'] },
        { id: 'c2', text: 'real', citedRefs: ['E1'] },
      ],
      placeholderPolicy,
      { mode: 'strict' },
    );
    expect(r.verdict).toBe('passed');
    expect(r.batch.failed).toBe(0);
    expect(r.batch.flagged).toBe(1);
    expect(r.summary).toContain('placeholder');
  });

  it('rejects placeholders under strict mode when the stage forbids them', () => {
    const r = enforceCitationPolicy(
      [{ id: 'c1', text: 'draft', citedRefs: ['<TBD>'] }],
      {
        allowedEvidenceRefs: ['E1'],
        placeholderTokens: ['<TBD>'],
        placeholderAllowed: false,
      },
      { mode: 'strict' },
    );
    expect(r.verdict).toBe('failed');
    expect(r.refusalReason).toBe('citation_policy_violation');
    expect(r.refusalMessage).toContain('placeholder_disallowed');
  });

  it('handles an empty claim list as a passing no-op verdict', () => {
    const r = enforceCitationPolicy([], allowedPolicy);
    expect(r.verdict).toBe('passed');
    expect(r.batch.total).toBe(0);
    expect(r.summary).toMatch(/all 0 claim/);
  });
});

describe('extractCitationRefs', () => {
  it('pulls bracket-style tokens out of prose', () => {
    const refs = extractCitationRefs(
      'See [E1] for curves and [artifact/figures/loss.png] for the plot.',
    );
    expect(refs).toEqual(['E1', 'artifact/figures/loss.png']);
  });

  it('de-duplicates while preserving order', () => {
    expect(extractCitationRefs('[E1] then [E1] then [E2]')).toEqual([
      'E1',
      'E2',
    ]);
  });

  it('ignores empty brackets and trims whitespace', () => {
    expect(extractCitationRefs('Noise [] and [ E1 ] cited')).toEqual(['E1']);
  });

  it('returns an empty list for empty input', () => {
    expect(extractCitationRefs('')).toEqual([]);
  });
});

describe('ResNet writing regression fixtures', () => {
  const resnetPolicy: WritingClaimPolicy = {
    allowedEvidenceRefs: [...RESNET_ALLOWED_EVIDENCE],
  };

  function claimFromFixture(key: keyof typeof RESNET_WRITING_EXAMPLES): WritingClaimSpec {
    const fixture = RESNET_WRITING_EXAMPLES[key];
    return {
      id: fixture.id,
      text: fixture.text,
      citedRefs: extractCitationRefs(fixture.text),
    };
  }

  it('accepts the strong fixture against citation and forbidden-claim checks', () => {
    const citation = enforceCitationPolicy([claimFromFixture('strong')], resnetPolicy);
    const forbidden = flagForbiddenClaims(
      RESNET_WRITING_EXAMPLES.strong.text,
      { forbiddenClaims: [...RESNET_FORBIDDEN_CLAIMS] },
    );
    expect(citation.verdict).toBe('passed');
    expect(forbidden.passed).toBe(true);
  });

  it('flags an overclaiming fixture even when citation is present', () => {
    const citation = enforceCitationPolicy(
      [claimFromFixture('overclaiming')],
      resnetPolicy,
    );
    const forbidden = flagForbiddenClaims(
      RESNET_WRITING_EXAMPLES.overclaiming.text,
      { forbiddenClaims: [...RESNET_FORBIDDEN_CLAIMS] },
    );
    expect(citation.verdict).toBe('passed');
    expect(forbidden.passed).toBe(false);
    expect(forbidden.matches).toEqual([
      'always',
      'solves vanishing gradients',
      'state of the art',
    ]);
  });

  it('rejects the citation-missing fixture under strict citation policy', () => {
    const citation = enforceCitationPolicy(
      [claimFromFixture('citationMissing')],
      resnetPolicy,
    );
    expect(citation.verdict).toBe('failed');
    expect(citation.refusalReason).toBe('citation_policy_violation');
    expect(citation.summary).toContain('no_citation');
  });
});
