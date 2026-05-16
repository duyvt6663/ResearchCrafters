import { describe, expect, it } from 'vitest';
import { checkDerivationSteps } from '../src/index.js';

describe('checkDerivationSteps', () => {
  const specs = [
    {
      id: 'identity-target',
      label: 'Identity residual target',
      acceptedEquivalentForms: ['F(x)=0', 'F = 0'],
      weight: 1,
    },
    {
      id: 'gradient-shortcut',
      label: 'Gradient shortcut term',
      acceptedEquivalentForms: ['\\frac{dF}{dx}+1', '1+\\frac{dF}{dx}'],
      weight: 2,
    },
  ];

  it('passes equivalent symbolic forms after lightweight normalization', () => {
    const result = checkDerivationSteps(
      [
        { id: 'identity-target', expression: ' F = 0 ' },
        { id: 'gradient-shortcut', expression: '$1 + \\frac{dF}{dx}$' },
      ],
      specs,
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
    expect(result.steps.map((s) => s.status)).toEqual(['passed', 'passed']);
  });

  it('returns per-step partial credit for missing or mismatched steps', () => {
    const result = checkDerivationSteps(
      [{ id: 'identity-target', expression: 'F(x)=0' }],
      specs,
    );
    expect(result.passed).toBe(false);
    expect(result.score).toBeCloseTo(1 / 3);
    expect(result.steps[1]?.status).toBe('missing');
    expect(result.dimensions[1]?.notes).toContain('was not answered');
  });

  it('surfaces invalid authored step specs without throwing', () => {
    const result = checkDerivationSteps(
      [{ id: 'bad', expression: 'x' }],
      [{ id: 'bad', acceptedEquivalentForms: [] }],
    );
    expect(result.passed).toBe(false);
    expect(result.steps[0]?.status).toBe('spec_invalid');
    expect(result.score).toBe(0);
  });
});
