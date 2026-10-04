/** architecture §8.3: per-turn call budgets and a repeat-call cache, shared
 * by both coach-tools.ts (analyze mode's 17 tools) and coach-tools-play.ts
 * (play mode's 3 additional tools) — extracted here so both files can build
 * on the exact same guardrails without importing from one another. */
import type { ChatMessage } from '../llm/messages.js';

export const TOOL_BUDGETS: Partial<Record<string, number>> = {
  get_engine_analysis: 2,
  get_user_profile: 1,
  // A DB read plus a pure render, no engine cost — but still one profile
  // per turn is all a coaching plan needs; matches get_user_profile's own
  // "read the student's standing evidence once" budget.
  get_diagnostic_profile: 1,
  // Same "read the standing evidence once per turn" shape as the two
  // profile reads above: a DB read plus a pure comparison, and a session
  // only ever needs one look at how this game sits against the baseline.
  get_player_stats: 1,
  recall_move: 3,
  get_candidate_moves: 3,
  // Categorically heavier than any other tool here — its own internal
  // bounded loop (position-investigator.ts) can itself make several engine
  // calls, so the outer per-turn count stays tight; the tool's own
  // description tells the coach to fold related sub-questions into one call.
  investigate_position: 1,
  // Task 66.2 — same anti-flood reasoning as puzzle-assignment.ts's own
  // MAX_NEW_ASSIGNMENTS_PER_RUN (the background job's equivalent cap): a
  // chatty session shouldn't be able to assign a pile of practice sets in
  // one reply. The DB-level anti-duplication check (an existing open
  // assignment is returned, not duplicated) already limits repeats across
  // a whole session; this budget is the per-turn backstop.
  assign_focused_session: 2
  // Deliberately absent: `check_moves` and `check_position`. Both are pure,
  // engine-free lookups whose whole purpose is to be cheaper than the coach
  // asserting a move from memory — a budget on them would put back the
  // incentive to guess. The repeat-call cache below still collapses
  // identical calls within a turn.
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

export interface ReplyInProgress {
  /** Guard state seeded with the tool calls this reply has already made. */
  state: TurnGuardState;
  /** Model steps (assistant messages) this reply has already taken. */
  priorSteps: number;
}

/**
 * A client tool (show_position, annotate_board, hypothetical_line, …) ends
 * the server turn, and the browser posts its result back as a brand-new turn
 * — so one coach reply to the student can span many turns, and guards that
 * reset per turn never fire: a model alternating get_engine_analysis and
 * annotate_board loops forever at two steps a turn. This reads the reply so
 * far (the trailing assistant/tool messages after the student's last
 * message) so the call budgets and llm/chat.ts's step cap count across the
 * whole reply instead.
 */
export function replyInProgress(messages: readonly ChatMessage[]): ReplyInProgress {
  const state = createTurnGuardState();
  const calls = new Map<string, { toolName: string; input: unknown }>();
  let priorSteps = 0;
  for (const message of replyMessages(messages)) {
    if (message.role === 'tool') {
      seedRepeatCache(state, calls, message.content);
      continue;
    }
    if (message.role !== 'assistant') continue;
    priorSteps++;
    if (typeof message.content === 'string') continue;
    for (const part of message.content) {
      if (part.type !== 'tool-call') continue;
      state.callCounts.set(part.toolName, (state.callCounts.get(part.toolName) ?? 0) + 1);
      calls.set(part.toolCallId, { toolName: part.toolName, input: part.input });
    }
  }
  return { state, priorSteps };
}

/** The messages after the student's last one, oldest first. */
function replyMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  const lastStudentIndex = messages.findLastIndex((message) => message.role === 'user' || message.role === 'system');
  return messages.slice(lastStudentIndex + 1);
}

/** Tools whose answer depends only on their arguments, so an identical call
 * later in the same reply is answered from the first one's result. Without
 * this a client-tool round trip (which starts a new turn) forgot the lookup
 * and the coach paid for the same check_moves twice. */
const REPEATABLE_TOOLS: ReadonlySet<string> = new Set(['check_moves', 'check_position', 'get_engine_analysis']);

function seedRepeatCache(
  state: TurnGuardState,
  calls: ReadonlyMap<string, { toolName: string; input: unknown }>,
  content: Extract<ChatMessage, { role: 'tool' }>['content']
): void {
  for (const part of content) {
    if (part.type !== 'tool-result' || !REPEATABLE_TOOLS.has(part.toolName)) continue;
    const call = calls.get(part.toolCallId);
    if (!call || (part.output.type !== 'text' && part.output.type !== 'json')) continue;
    state.cache.set(`${call.toolName}:${JSON.stringify(call.input)}`, part.output.value);
  }
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
