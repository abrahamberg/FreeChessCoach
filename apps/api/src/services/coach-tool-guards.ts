/** architecture §8.3: per-turn call budgets and a repeat-call cache, shared
 * by both coach-tools.ts (analyze mode's 15 tools) and coach-tools-play.ts
 * (play mode's 3 additional tools) — extracted here so both files can build
 * on the exact same guardrails without importing from one another. */
export const TOOL_BUDGETS: Partial<Record<string, number>> = {
  get_engine_analysis: 2,
  get_user_profile: 1,
  // A DB read plus a pure render, no engine cost — but still one profile
  // per turn is all a coaching plan needs; matches get_user_profile's own
  // "read the student's standing evidence once" budget.
  get_diagnostic_profile: 1,
  recall_move: 3,
  get_candidate_moves: 3,
  // Categorically heavier than any other tool here — its own internal
  // bounded loop (position-investigator.ts) can itself make several engine
  // calls, so the outer per-turn count stays tight; the tool's own
  // description tells the coach to fold related sub-questions into one call.
  investigate_position: 1
};
export const BUDGET_EXHAUSTED = { error: 'budget_exhausted — answer with what you have' } as const;

export interface TurnGuardState {
  callCounts: Map<string, number>;
  cache: Map<string, unknown>;
}

/** Fresh state per agent turn — buildCoachTools is expected to be called
 * once per turn (architecture §8.3's guardrails are per-turn), and shares
 * one instance across both the analyze-mode and play-mode tool sets. */
export function createTurnGuardState(): TurnGuardState {
  return { callCounts: new Map(), cache: new Map() };
}

export function withTurnGuards<Args, Result>(
  state: TurnGuardState,
  name: string,
  fn: (args: Args) => Promise<Result>,
  budgets: Partial<Record<string, number>> = TOOL_BUDGETS
): (args: Args) => Promise<Result | typeof BUDGET_EXHAUSTED> {
  return async (args: Args) => {
    const cacheKey = `${name}:${JSON.stringify(args)}`;
    const cached = state.cache.get(cacheKey);
    if (cached !== undefined) return cached as Result;

    const budget = budgets[name];
    if (budget !== undefined && (state.callCounts.get(name) ?? 0) >= budget) {
      return BUDGET_EXHAUSTED;
    }
    if (budget !== undefined) {
      state.callCounts.set(name, (state.callCounts.get(name) ?? 0) + 1);
    }

    const result = await fn(args);
    state.cache.set(cacheKey, result);
    return result;
  };
}
