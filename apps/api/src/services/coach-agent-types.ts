import type { PuzzleRecord } from '@freechesscoach/chess-analysis';
import type { ClientToolResult } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import type { GatewayConfig, ModelResolution, Tier } from '../llm/gateway.js';
import type { JobQueue } from '../jobs/queue.js';
import type { BotMoveSelectorDependencies } from './bot/bot-move-selector.js';
import type { AnalyzePosition } from './engine/engine-backend.js';

export type ModelResolver = (
  db: Kysely<Database>,
  gatewayConfig: GatewayConfig,
  userId: string,
  tier: Tier
) => Promise<ModelResolution>;

export interface CoachAgentDependencies {
  db: Kysely<Database>;
  jobQueue: JobQueue;
  gatewayConfig: GatewayConfig;
  analyzePosition: AnalyzePosition;
  /** The light-tier subagent call, bound to the session's user — BYOK is the
   * only LLM path, so episode folds / move notes resolve the user's own key.
   * Built per-request in routes/sessions.ts's buildRequestScopedAgentDeps;
   * tests inject a vi.fn() directly. */
  callLightModel: (messages: { system: string; user: string }) => Promise<string>;
  /** Defaults to the real gateway; tests override with a MockLanguageModelV1. */
  resolveModel?: ModelResolver;
  /** Task 66.2 — the in-memory puzzle pool, opened once at process start
   * and carried straight through from CoachAgentBaseDependencies. See
   * CoachToolsDependencies.puzzlePool's doc comment for the null contract. */
  puzzlePool?: readonly PuzzleRecord[] | null;
  /** Play mode: the engine and randomness the coach's own move is picked
   * with before the model runs (coach-move-plan.ts). Omitted, the coach
   * picks its move itself via get_candidate_moves. */
  coachMoveSelector?: BotMoveSelectorDependencies;
}

export interface StartTurnInput {
  content?: string;
  clientToolResult?: ClientToolResult;
}
