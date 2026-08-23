import { applySanSequence } from '@freechesscoach/chess-analysis';
import { INVESTIGATE_POSITION_SYSTEM_PROMPT, renderInvestigatePositionPrompt } from '@freechesscoach/prompts';
import type { PositionAnalysis } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { runBoundedToolLoop } from '../llm/agent-text.js';
import type { GatewayConfig } from '../llm/gateway.js';
import { recordUsage } from '../llm/gateway.js';
import { toBillableTokens } from '../llm/usage.js';
import type { Database } from '../db/schema.js';
import { buildInvestigatorTools } from './investigator-tools.js';
import type { ModelResolver } from './coach-agent-types.js';

/** architecture §8.3-style bound, mirroring MAX_STEPS's role for the outer
 * coach turn (llm/chat.ts) — the investigation sub-agent's own hard cap on
 * model round-trips. */
const MAX_INVESTIGATOR_STEPS = 4;

export interface PositionInvestigatorDependencies {
  db: Kysely<Database>;
  gatewayConfig: GatewayConfig;
  resolveModel: ModelResolver;
  analyzePosition: (fen: string) => Promise<PositionAnalysis>;
}

export interface PositionInvestigatorContext {
  userId: string;
  sessionId: string;
}

export interface InvestigatePositionArgs {
  fen: string;
  moves?: string[];
  question: string;
}

/**
 * The investigate_position coach tool's service layer (design doc: a true
 * bounded agentic loop, not a fixed gather-then-digest pattern). Metered on
 * the per-user "planner/summarizer" pattern (gateway.ts's getModelForUser +
 * recordUsage), not the free digest pattern the mechanical single-shot
 * subagents use — this call can trigger several internal engine + light-model
 * calls, so making it invisible cost would be inconsistent with credits.ts.
 *
 * Never throws into the outer coach turn — mirrors
 * coach-context-episode-close.ts's closeEpisodeIfNeeded, except this one must
 * return something the coach can read as a tool result, so failure returns a
 * plain fallback sentence rather than silently doing nothing.
 */
export async function investigatePosition(
  deps: PositionInvestigatorDependencies,
  ctx: PositionInvestigatorContext,
  args: InvestigatePositionArgs
): Promise<string> {
  const walked = applySanSequence(args.fen, args.moves ?? []);
  if (walked.error) return `Could not investigate: ${walked.error}`;
  const startingFen = walked.moves.at(-1)?.fen ?? args.fen;

  try {
    const resolution = await deps.resolveModel(deps.db, deps.gatewayConfig, ctx.userId, 'light');

    const result = await runBoundedToolLoop({
      resolution,
      system: INVESTIGATE_POSITION_SYSTEM_PROMPT,
      prompt: renderInvestigatePositionPrompt(startingFen, args.question),
      tools: buildInvestigatorTools({ analyzePosition: deps.analyzePosition }),
      maxSteps: MAX_INVESTIGATOR_STEPS
    });

    await recordUsage(deps.db, {
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      provider: resolution.provider,
      model: resolution.modelId,
      tier: 'light',
      usage: toBillableTokens(result.usage),
      purpose: 'investigate_position',
      metered: resolution.metered
    });

    return result.text.trim() || 'Investigation did not reach a conclusion in time.';
  } catch (error) {
    console.error(`investigatePosition failed for session ${ctx.sessionId}:`, error);
    return 'Could not complete that investigation right now.';
  }
}
