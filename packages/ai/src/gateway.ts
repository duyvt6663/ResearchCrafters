import type { LLMRequest, LLMResponse, Provider } from './types.js';

/**
 * Provider-agnostic gateway interface. The web app and evaluator-sdk both
 * depend on this shape, never on a specific provider SDK.
 */
export interface LLMGateway {
  complete(req: LLMRequest): Promise<LLMResponse>;
}

/**
 * Anthropic adapter. The actual SDK is loaded lazily so unit tests never need
 * the dependency present at runtime; tests should always wire a mock gateway
 * via `MockLLMGateway` or a custom one.
 *
 * Throws when `ANTHROPIC_API_KEY` is unset — this is the safety stop that
 * prevents accidental real API calls during tests or local dev.
 */
export class AnthropicGateway implements LLMGateway {
  private readonly apiKey: string;

  constructor(opts: { apiKey?: string } = {}) {
    const key = opts.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!key) {
      throw new Error(
        'AnthropicGateway: ANTHROPIC_API_KEY is unset. Tests must use a mock gateway.',
      );
    }
    this.apiKey = key;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    // Lazy import — keeps the SDK out of the test path.
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: this.apiKey });
    const result = await client.messages.create({
      model: req.modelId,
      max_tokens: req.maxOutputTokens,
      system: req.systemPrompt,
      messages: [{ role: 'user', content: req.userPrompt }],
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    });
    const text = result.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    return {
      text,
      modelTier: req.modelTier,
      modelId: req.modelId,
      provider: 'anthropic' as Provider,
      promptTokens: result.usage.input_tokens,
      completionTokens: result.usage.output_tokens,
      ...(result.stop_reason ? { finishReason: result.stop_reason } : {}),
    };
  }
}

/**
 * Deterministic mock gateway used by tests and leak-test harness. The handler
 * sees the request and returns the response body as a plain string; the
 * gateway wraps it with the required telemetry fields.
 */
export class MockLLMGateway implements LLMGateway {
  constructor(
    private readonly handler: (req: LLMRequest) => string | Promise<string>,
  ) {}

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const text = await this.handler(req);
    // Rough token estimates — tests only check that fields exist.
    const promptTokens = Math.max(1, Math.ceil((req.systemPrompt.length + req.userPrompt.length) / 4));
    const completionTokens = Math.max(1, Math.ceil(text.length / 4));
    return {
      text,
      modelTier: req.modelTier,
      modelId: req.modelId,
      provider: 'mock',
      promptTokens,
      completionTokens,
      finishReason: 'end_turn',
    };
  }
}
