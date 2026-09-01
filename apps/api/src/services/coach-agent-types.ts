import type { ClientToolResult, PositionAnalysis } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import type { GatewayConfig, ModelResolution, Tier } from '../llm/gateway.js';
import type { JobQueue } from '../jobs/queue.js';

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
  analyzePosition: (fen: string) => Promise<PositionAnalysis>;
  /** The light-tier subagent call, bound to the session's user — BYOK is the
   * only LLM path, so episode folds / move notes resolve the user's own key.
   * Built per-request in routes/sessions.ts's buildRequestScopedAgentDeps;
   * tests inject a vi.fn() directly. */
  callLightModel: (messages: { system: string; user: string }) => Promise<string>;
  /** Defaults to the real gateway; tests override with a MockLanguageModelV1. */
  resolveModel?: ModelResolver;
}

export interface StartTurnInput {
  content?: string;
  clientToolResult?: ClientToolResult;
}
