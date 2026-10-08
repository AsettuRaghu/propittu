import { env } from '../../env.js';
import { anthropicProvider } from './anthropic.js';
import { AiProviderError, type AiProvider, type AiTask, type ProviderRequest } from './types.js';

/**
 * Picks the provider from configuration. 'fake' answers with the task's
 * fixture (tests only) so the whole pipeline can be exercised without a key.
 */
let cached: AiProvider | null = null;

export function provider(task: AiTask<unknown>): AiProvider {
  if (env.AI_PROVIDER === 'fake') return fakeProvider(task);
  if (!env.ANTHROPIC_API_KEY)
    throw new AiProviderError('not_configured', false, 'ANTHROPIC_API_KEY is not set');
  cached ??= anthropicProvider(env.ANTHROPIC_API_KEY);
  return cached;
}

function fakeProvider(task: AiTask<unknown>): AiProvider {
  return {
    name: 'fake',
    async run(req: ProviderRequest) {
      return {
        json: task.fixture,
        model: `fake:${req.model}`,
        inputTokens: 1000,
        outputTokens: 100,
        durationMs: 5,
      };
    },
  };
}
