/**
 * Approximate prices (USD per million tokens) used for our cost log and
 * budget. The Anthropic Console bill is the authority; these are calibrated
 * against it (trial, 6 Oct 2026) and reviewed when models change. Unknown
 * models are charged at the highest rate, so the budget errs on the safe side.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};
const FALLBACK = { input: 15, output: 75 };

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? PRICES[model.replace(/-\d{8}$/, '')] ?? FALLBACK;
  return +((inputTokens * p.input + outputTokens * p.output) / 1_000_000).toFixed(5);
}
