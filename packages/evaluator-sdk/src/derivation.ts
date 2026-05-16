import type { RubricDimensionScore } from './types.js';

export interface DerivationStepSpec {
  id: string;
  label?: string;
  acceptedEquivalentForms: ReadonlyArray<string>;
  weight?: number;
  required?: boolean;
}

export interface DerivationStepSubmission {
  id: string;
  expression?: string;
}

export type DerivationStepStatus = 'passed' | 'missing' | 'mismatch' | 'spec_invalid';

export interface DerivationStepResult {
  id: string;
  label: string;
  status: DerivationStepStatus;
  score: number;
  weight: number;
  message: string;
}

export interface DerivationCheckResult {
  passed: boolean;
  score: number;
  steps: ReadonlyArray<DerivationStepResult>;
  dimensions: ReadonlyArray<RubricDimensionScore>;
}

function normalizeExpression(input: string): string {
  return input
    .trim()
    .replace(/^\$+|\$+$/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/[{}\s]/g, '')
    .replace(/−/g, '-')
    .toLowerCase();
}

function makeStepResult(
  spec: DerivationStepSpec,
  status: DerivationStepStatus,
  score: number,
  message: string,
): DerivationStepResult {
  return {
    id: spec.id,
    label: spec.label ?? spec.id,
    status,
    score,
    weight: spec.weight ?? 1,
    message,
  };
}

export function checkDerivationSteps(
  submissions: ReadonlyArray<DerivationStepSubmission>,
  specs: ReadonlyArray<DerivationStepSpec>,
): DerivationCheckResult {
  const byId = new Map(submissions.map((s) => [s.id, s]));
  const steps = specs.map((spec) => {
    if (spec.acceptedEquivalentForms.length === 0) {
      return makeStepResult(
        spec,
        'spec_invalid',
        0,
        `step '${spec.id}' has no accepted equivalent forms`,
      );
    }
    const submitted = byId.get(spec.id);
    const raw = submitted?.expression?.trim();
    if (!raw) {
      return makeStepResult(
        spec,
        'missing',
        spec.required === false ? 1 : 0,
        `step '${spec.id}' was not answered`,
      );
    }
    const normalized = normalizeExpression(raw);
    const accepted = spec.acceptedEquivalentForms.map(normalizeExpression);
    if (accepted.includes(normalized)) {
      return makeStepResult(spec, 'passed', 1, `step '${spec.id}' matched an accepted form`);
    }
    return makeStepResult(
      spec,
      'mismatch',
      0,
      `step '${spec.id}' did not match an accepted form`,
    );
  });

  const totalWeight = steps.reduce((sum, step) => sum + step.weight, 0);
  const weighted = steps.reduce(
    (sum, step) => sum + step.score * step.weight,
    0,
  );
  const score = totalWeight === 0 ? 0 : weighted / totalWeight;
  const dimensions: RubricDimensionScore[] = steps.map((step) => ({
    id: step.id,
    label: step.label,
    score: step.score,
    weight: step.weight,
    notes: step.message,
  }));
  return {
    passed: steps.length > 0 && steps.every((step) => step.status === 'passed'),
    score,
    steps,
    dimensions,
  };
}
