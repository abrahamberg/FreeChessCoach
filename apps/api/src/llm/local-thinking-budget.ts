import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';

/** Characters of thinking a local model may stream before the coach gives up
 * on it and asks again with thinking off (about 4 characters per token).
 * Some models (Gemma) only have thinking on or off, so any level above Off
 * lets them think until the context is full; this is the level's real limit. */
const BUDGET_CHARS = { low: 2_000, medium: 4_000, high: 8_000 } as const;

/** Undefined when thinking is off (nothing to cap). `provider-default` gets
 * the `medium` budget: a local model left to itself has no limit at all. */
export function thinkingBudgetChars(reasoning: LanguageModelV4CallOptions['reasoning']): number | undefined {
  if (reasoning === 'none') return undefined;
  if (reasoning === 'minimal' || reasoning === 'low') return BUDGET_CHARS.low;
  if (reasoning === 'high' || reasoning === 'xhigh') return BUDGET_CHARS.high;
  return BUDGET_CHARS.medium;
}
