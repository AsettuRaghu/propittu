import Anthropic, { APIError } from '@anthropic-ai/sdk';
import {
  AiProviderError,
  type AiProvider,
  type ProviderRequest,
  type ProviderResponse,
} from './types.js';

/**
 * Anthropic (Claude) adapter — the ONLY file that knows the provider's API.
 * PDFs go as document blocks; the answer is constrained to the task's JSON
 * schema (structured output). Our job runner owns retries, so the SDK only
 * retries once on connection errors.
 */
export function anthropicProvider(apiKey: string): AiProvider {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 100_000 });

  return {
    name: 'anthropic',
    async run(req: ProviderRequest): Promise<ProviderResponse> {
      const t0 = Date.now();
      let msg;
      try {
        msg = await client.messages.create({
          model: req.model,
          max_tokens: req.maxOutputTokens,
          system: req.system,
          messages: [
            {
              role: 'user',
              content: [
                ...req.documents.map((d) => ({
                  type: 'document' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: 'application/pdf' as const,
                    data: Buffer.from(d.bytes).toString('base64'),
                  },
                })),
                { type: 'text' as const, text: req.text },
              ],
            },
          ],
          output_config: { format: { type: 'json_schema', schema: req.schema } },
        });
      } catch (err) {
        const durationMs = Date.now() - t0;
        if (err instanceof APIError) {
          const status = err.status ?? 0;
          // 429 rate limit, 529 overloaded, 5xx: try again later. 4xx: our request is wrong.
          const retryable = status === 429 || status >= 500 || status === 0;
          throw new AiProviderError(`http_${status || 'network'}`, retryable, err.message, {
            inputTokens: 0,
            outputTokens: 0,
            durationMs,
          });
        }
        throw new AiProviderError('network', true, String(err), {
          inputTokens: 0,
          outputTokens: 0,
          durationMs,
        });
      }

      const durationMs = Date.now() - t0;
      const usage = {
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        durationMs,
      };
      if (msg.stop_reason === 'max_tokens') {
        throw new AiProviderError('truncated', false, 'Answer was cut off (max tokens)', usage);
      }
      const text = msg.content.find((c) => c.type === 'text');
      if (!text || text.type !== 'text') {
        throw new AiProviderError('no_text', false, 'No answer text', usage);
      }
      let json: unknown;
      try {
        json = JSON.parse(text.text);
      } catch {
        throw new AiProviderError('bad_json', false, 'Answer was not JSON', usage);
      }
      return { json, model: msg.model, ...usage };
    },
  };
}
