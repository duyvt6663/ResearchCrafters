import { describe, expect, it } from 'vitest';
import {
  checkConceptualExplanation,
  checkCounterexample,
  checkMathFallback,
  checkProofOutline,
  type ConceptualExplanationSpec,
  type CounterexampleSpec,
  type ProofOutlineSpec,
} from '../src/math-fallback.js';

describe('checkProofOutline', () => {
  const baseSpec: ProofOutlineSpec = {
    id: 'proof.triangle',
    kind: 'proof_outline',
    minSteps: 2,
  };

  it('passes when every step has a justification', () => {
    const result = checkProofOutline(
      {
        steps: [
          { claim: 'angles sum to pi', justification: 'by definition of triangle' },
          { claim: 'each angle < pi', justification: 'follows from step 1' },
        ],
      },
      baseSpec,
    );
    expect(result.status).toBe('ok');
    expect(result.kind).toBe('proof_outline');
    expect(result.rubricScaffold.dimensions.length).toBeGreaterThan(0);
    expect(result.dimensions.map((d) => d.id)).toContain('justifications_present');
    expect(result.dimensions.find((d) => d.id === 'justifications_present')?.score).toBe(1);
  });

  it('fails when fewer steps than minSteps', () => {
    const result = checkProofOutline(
      { steps: [{ claim: 'angles sum to pi', justification: 'definition' }] },
      baseSpec,
    );
    expect(result.status).toBe('failed');
    expect(result.message).toMatch(/2 required/);
    expect(result.dimensions.find((d) => d.id === 'step_count')?.score).toBe(0);
  });

  it('fails when any step lacks a justification', () => {
    const result = checkProofOutline(
      {
        steps: [
          { claim: 'angles sum to pi', justification: 'definition' },
          { claim: 'each angle < pi' },
          { claim: 'q.e.d.', justification: '   ' },
        ],
      },
      baseSpec,
    );
    expect(result.status).toBe('failed');
    const justDim = result.dimensions.find(
      (d) => d.id === 'justifications_present',
    );
    expect(justDim).toBeDefined();
    expect(justDim!.score).toBeCloseTo(1 / 3, 5);
    expect(justDim!.notes).toMatch(/step\(s\): 2, 3/);
  });

  it('skips justification check when requireJustifications=false', () => {
    const result = checkProofOutline(
      { steps: [{ claim: 'a' }, { claim: 'b' }] },
      { ...baseSpec, requireJustifications: false },
    );
    expect(result.status).toBe('ok');
    expect(
      result.dimensions.find((d) => d.id === 'justifications_present'),
    ).toBeUndefined();
  });

  it('returns spec_invalid for negative minSteps', () => {
    const result = checkProofOutline(
      { steps: [{ claim: 'a', justification: 'b' }] },
      { ...baseSpec, minSteps: -1 },
    );
    expect(result.status).toBe('spec_invalid');
  });
});

describe('checkCounterexample', () => {
  const baseSpec: CounterexampleSpec = {
    id: 'cex.relu_smoothness',
    kind: 'counterexample',
    mustViolate: ['relu is differentiable everywhere'],
  };

  it('passes when witness present and all required claims targeted', () => {
    const result = checkCounterexample(
      {
        instance: 'x = 0',
        satisfies: ['x in R'],
        violates: ['ReLU is differentiable everywhere'],
      },
      baseSpec,
    );
    expect(result.status).toBe('ok');
    expect(result.dimensions.find((d) => d.id === 'witness_present')?.score).toBe(1);
    expect(result.dimensions.find((d) => d.id === 'claims_targeted')?.score).toBe(1);
  });

  it('fails when witness is missing', () => {
    const result = checkCounterexample(
      { violates: ['ReLU is differentiable everywhere'] },
      baseSpec,
    );
    expect(result.status).toBe('failed');
    expect(result.message).toMatch(/no counterexample/);
  });

  it('fails when a required violated claim is missing', () => {
    const result = checkCounterexample(
      { instance: 'x = 0', violates: ['some other thing'] },
      baseSpec,
    );
    expect(result.status).toBe('failed');
    expect(result.dimensions.find((d) => d.id === 'claims_targeted')?.score).toBe(0);
  });

  it('respects the verifier when it rejects the witness', () => {
    const result = checkCounterexample(
      {
        instance: 'x = 1',
        violates: ['ReLU is differentiable everywhere'],
      },
      { ...baseSpec, verifier: (instance) => instance.includes('0') },
    );
    expect(result.status).toBe('failed');
    expect(result.dimensions.find((d) => d.id === 'verifier')?.score).toBe(0);
  });

  it('respects the verifier when it accepts the witness', () => {
    const result = checkCounterexample(
      {
        instance: 'x = 0',
        violates: ['ReLU is differentiable everywhere'],
      },
      { ...baseSpec, verifier: (instance) => instance.includes('0') },
    );
    expect(result.status).toBe('ok');
    expect(result.dimensions.find((d) => d.id === 'verifier')?.score).toBe(1);
  });

  it('returns spec_invalid if verifier throws', () => {
    const result = checkCounterexample(
      {
        instance: 'x = 0',
        violates: ['ReLU is differentiable everywhere'],
      },
      {
        ...baseSpec,
        verifier: () => {
          throw new Error('boom');
        },
      },
    );
    expect(result.status).toBe('spec_invalid');
    expect(result.message).toMatch(/verifier threw: boom/);
  });

  it('returns spec_invalid when mustViolate is empty', () => {
    const result = checkCounterexample(
      { instance: 'x', violates: ['a'] },
      { id: 'c', kind: 'counterexample', mustViolate: [] },
    );
    expect(result.status).toBe('spec_invalid');
  });
});

describe('checkConceptualExplanation', () => {
  const baseSpec: ConceptualExplanationSpec = {
    id: 'concept.residual',
    kind: 'conceptual_explanation',
    requiredConcepts: ['residual', 'gradient flow'],
    minWords: 5,
    maxWords: 200,
  };

  it('passes when concepts mentioned and length is in range', () => {
    const result = checkConceptualExplanation(
      {
        text: 'A residual connection improves gradient flow by adding skip paths.',
      },
      baseSpec,
    );
    expect(result.status).toBe('ok');
    expect(result.dimensions.find((d) => d.id === 'concept_coverage')?.score).toBe(1);
    expect(result.dimensions.find((d) => d.id === 'word_count')?.score).toBe(1);
  });

  it('fails when a required concept is missing', () => {
    const result = checkConceptualExplanation(
      { text: 'Residual connections add a shortcut path between layers, helping training.' },
      baseSpec,
    );
    expect(result.status).toBe('failed');
    const cov = result.dimensions.find((d) => d.id === 'concept_coverage');
    expect(cov!.score).toBeCloseTo(0.5, 5);
    expect(cov!.notes).toMatch(/gradient flow/);
  });

  it('fails when shorter than minWords', () => {
    const result = checkConceptualExplanation(
      { text: 'residual gradient flow good' },
      baseSpec,
    );
    expect(result.status).toBe('failed');
    expect(result.message).toMatch(/too short/);
  });

  it('fails when longer than maxWords', () => {
    const long = Array.from({ length: 250 }, () => 'word').join(' ') + ' residual gradient flow';
    const result = checkConceptualExplanation({ text: long }, baseSpec);
    expect(result.status).toBe('failed');
    expect(result.message).toMatch(/exceeds the length cap/);
  });

  it('returns spec_invalid when requiredConcepts is empty', () => {
    const result = checkConceptualExplanation(
      { text: 'whatever' },
      {
        id: 'c',
        kind: 'conceptual_explanation',
        requiredConcepts: [],
        minWords: 0,
        maxWords: 100,
      },
    );
    expect(result.status).toBe('spec_invalid');
  });

  it('returns spec_invalid when maxWords < minWords', () => {
    const result = checkConceptualExplanation(
      { text: 'residual gradient flow' },
      { ...baseSpec, minWords: 100, maxWords: 5 },
    );
    expect(result.status).toBe('spec_invalid');
  });
});

describe('checkMathFallback dispatcher', () => {
  it('dispatches to proof_outline checker', () => {
    const result = checkMathFallback(
      {
        kind: 'proof_outline',
        submission: {
          steps: [{ claim: 'a', justification: 'b' }],
        },
      },
      { id: 'p', kind: 'proof_outline', minSteps: 1 },
    );
    expect(result.kind).toBe('proof_outline');
    expect(result.status).toBe('ok');
  });

  it('flags spec_invalid when submission kind mismatches spec kind', () => {
    const result = checkMathFallback(
      {
        kind: 'counterexample',
        submission: { instance: 'x', violates: ['a'] },
      },
      { id: 'p', kind: 'proof_outline' },
    );
    expect(result.status).toBe('spec_invalid');
    expect(result.message).toMatch(/does not match/);
  });

  it('fails when submission is undefined', () => {
    const result = checkMathFallback(undefined, {
      id: 'p',
      kind: 'proof_outline',
    });
    expect(result.status).toBe('failed');
    expect(result.dimensions).toHaveLength(0);
    expect(result.rubricScaffold.kind).toBe('proof_outline');
  });

  it('exposes the default rubric scaffold per kind', () => {
    const proof = checkMathFallback(undefined, {
      id: 'p',
      kind: 'proof_outline',
    });
    expect(proof.rubricScaffold.dimensions.map((d) => d.id)).toEqual([
      'logical_validity',
      'completeness',
      'clarity',
    ]);

    const cex = checkMathFallback(undefined, {
      id: 'c',
      kind: 'counterexample',
      mustViolate: ['a'],
    });
    expect(cex.rubricScaffold.dimensions.map((d) => d.id)).toEqual([
      'witness_validity',
      'explanation_quality',
    ]);

    const concept = checkMathFallback(undefined, {
      id: 'e',
      kind: 'conceptual_explanation',
      requiredConcepts: ['x'],
    });
    expect(concept.rubricScaffold.dimensions.map((d) => d.id)).toEqual([
      'concept_accuracy',
      'coverage',
      'clarity',
    ]);
  });

  it('honors a spec-provided rubricScaffold override', () => {
    const result = checkMathFallback(
      {
        kind: 'conceptual_explanation',
        submission: { text: 'residual gradient flow blah blah blah' },
      },
      {
        id: 'e',
        kind: 'conceptual_explanation',
        requiredConcepts: ['residual', 'gradient flow'],
        rubricScaffold: {
          kind: 'conceptual_explanation',
          dimensions: [
            { id: 'custom', label: 'Custom', weight: 1, description: 'd' },
          ],
        },
      },
    );
    expect(result.rubricScaffold.dimensions.map((d) => d.id)).toEqual(['custom']);
  });
});
