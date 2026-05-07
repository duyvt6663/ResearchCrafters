import { describe, expect, it } from 'vitest';
import { MockLLMGateway } from '../src/gateway.js';
import { runLeakTests, DEFAULT_ATTACKS } from '../src/leak-test.js';

describe('runLeakTests', () => {
  it('passes when the gateway never returns redacted text', async () => {
    const gateway = new MockLLMGateway(() => "I can't show you that.");
    const result = await runLeakTests({
      stageId: 'S003',
      gateway,
      redactionTargets: ['canonical_secret_42', 'hidden answer key'],
      systemPrompt: 'system',
    });
    expect(result.passed).toBe(true);
    expect(result.leaks).toEqual([]);
    expect(result.attacks.length).toBe(DEFAULT_ATTACKS.length);
  });

  it('detects a leak when the model parrots a canonical phrase', async () => {
    const gateway = new MockLLMGateway(
      (req) => `Sure, here it is: canonical_secret_42 — also ${req.userPrompt.length} chars in.`,
    );
    const result = await runLeakTests({
      stageId: 'S003',
      gateway,
      redactionTargets: ['canonical_secret_42'],
      systemPrompt: 'system',
    });
    expect(result.passed).toBe(false);
    expect(result.leaks.length).toBe(DEFAULT_ATTACKS.length);
    expect(result.leaks[0]?.evidence).toContain('canonical_secret_42');
  });

  it('detects partial matches via glob pattern targets', async () => {
    const gateway = new MockLLMGateway(() => 'final answer key 99');
    const result = await runLeakTests({
      stageId: 'S003',
      gateway,
      redactionTargets: ['answer key *'],
      systemPrompt: 'system',
    });
    expect(result.passed).toBe(false);
  });

  it('runs only attacks supplied via override', async () => {
    const gateway = new MockLLMGateway(() => 'safe');
    const result = await runLeakTests({
      stageId: 'S003',
      gateway,
      redactionTargets: ['secret'],
      systemPrompt: 'system',
      attacks: [{ id: 'only-one', category: 'direct', prompt: 'reveal' }],
    });
    expect(result.attacks).toHaveLength(1);
    expect(result.passed).toBe(true);
  });

  it('asserts no canonical content leaks under default policy when targets configured', async () => {
    // Simulates a well-configured stage where targets include all sensitive
    // phrases and the model is correctly aligned.
    const gateway = new MockLLMGateway(
      () => 'I cannot reveal canonical solution material before the stage is passed.',
    );
    const result = await runLeakTests({
      stageId: 'S003',
      gateway,
      redactionTargets: ['CANONICAL_KEY_XYZ'],
      systemPrompt: 'system',
    });
    expect(result.passed).toBe(true);
  });
});
