import { buildPuzzleCoachSystemPrompt } from '@freechesscoach/prompts';
import type { ClientToolResult } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import type { PuzzleSessionRow } from '../db/repositories/puzzle-sessions.js';
import type { Database } from '../db/schema.js';
import { ConflictError, InsufficientCreditsError, NotFoundError } from '../lib/errors.js';
import { createKeyedLock } from '../lib/keyedLock.js';
import { findSuccessfulToolResult } from '../lib/tool-parts.js';
import { runCoachTurn, type CoachTurnStream } from '../llm/chat.js';
import type { GatewayConfig, ModelResolution, Tier } from '../llm/gateway.js';
import { getModelForUser, recordUsage, streamTimeoutsFor } from '../llm/gateway.js';
import { cachedSystemMessage, systemMessage, type ChatMessage } from '../llm/messages.js';
import { toBillableTokens } from '../llm/usage.js';
import type { CreditsService } from './credits.js';
import { createCreditsService } from './credits.js';
import { buildPuzzleSessionTools, type AdvancePuzzleToolResult } from './puzzle-session-tools.js';

/** Serializes startPuzzleTurn calls per session — same client-tool-result
 * race createKeyedLock's own doc comment describes for the game-review
 * lock (coach-agent-turn.ts). A separate lock instance: puzzle_sessions and
 * sessions are different id spaces, but there's no reason to couple their
 * in-memory locking either. */
const puzzleSessionLock = createKeyedLock();

export type PuzzleModelResolver = (
  db: Kysely<Database>,
  gatewayConfig: GatewayConfig,
  userId: string,
  tier: Tier
) => Promise<ModelResolution>;

export interface PuzzleTurnDependencies {
  db: Kysely<Database>;
  gatewayConfig: GatewayConfig;
  /** Defaults to the real gateway; tests override with a MockLanguageModelV4. */
  resolveModel?: PuzzleModelResolver;
  /** Defaults to a real CreditsService over `db`. */
  creditsService?: CreditsService;
}

export interface StartPuzzleTurnInput {
  content?: string;
  clientToolResult?: ClientToolResult;
}

/** Not persisted anywhere — synthesizes the model's first input on a brand
 * new session (empty history), same role `buildEpisodeMessages`'
 * `currentMoveBlock` fallback plays for an empty episode (coach-context.ts):
 * a provider rejects an empty message list, so this becomes the thing the
 * coach's opening turn is "responding to" instead of a real instruction. */
const OPENING_TURN_CONTENT = 'Begin the puzzle session.';

/**
 * puzzle-session equivalent of coach-agent-turn.ts's startTurn — much
 * simpler, since a puzzle session has no episodes/subjectPly/flashback
 * concept (docs/plan.md Phase 59's "parallel table" rationale): the
 * conversation is just this session's whole message history, replayed
 * as-is, against a system prompt built from the current item alone.
 */
export async function startPuzzleTurn(
  deps: PuzzleTurnDependencies,
  session: PuzzleSessionRow,
  input: StartPuzzleTurnInput
): Promise<CoachTurnStream> {
  const release = await puzzleSessionLock.acquire(session.id);
  let released = false;
  const releaseOnce = (): void => {
    if (released) return;
    released = true;
    release();
  };

  try {
    const resolveModel = deps.resolveModel ?? getModelForUser;
    const resolution = await resolveModel(deps.db, deps.gatewayConfig, session.userId, 'standard');

    if (resolution.metered) {
      const creditsService = deps.creditsService ?? createCreditsService(deps.db);
      try {
        await creditsService.assertCanSpend(session.userId);
      } catch (error) {
        await puzzleSessionsRepo.markPausedNoCredits(deps.db, session.id);
        throw error instanceof InsufficientCreditsError ? error : new InsufficientCreditsError('Insufficient credits');
      }
    }

    const assignment = await puzzleAssignmentsRepo.findById(deps.db, session.assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');
    const currentItemIndex = session.currentItemIndex;
    const currentItem = assignment.items[currentItemIndex];
    if (!currentItem) throw new ConflictError('This session has no current puzzle — it may already be complete');

    if (input.content !== undefined) {
      await puzzleSessionsRepo.insertMessage(deps.db, session.id, 'user', input.content, currentItemIndex);
    }
    if (input.clientToolResult) {
      await puzzleSessionsRepo.insertMessage(
        deps.db,
        session.id,
        'tool',
        [
          {
            type: 'tool-result',
            toolCallId: input.clientToolResult.toolCallId,
            toolName: input.clientToolResult.toolName,
            output: { type: 'json', value: input.clientToolResult.result }
          }
        ],
        currentItemIndex
      );
    }

    const { staticPart, dynamicPart } = buildPuzzleCoachSystemPrompt({
      reason: assignment.reason,
      totalCount: assignment.items.length,
      currentItem: { fen: currentItem.fen, moves: currentItem.moves, index: currentItemIndex + 1 }
    });
    const instructions = [cachedSystemMessage(staticPart), systemMessage(dynamicPart)];

    const historyRows = await puzzleSessionsRepo.listMessagesBySession(deps.db, session.id);
    const messages: ChatMessage[] =
      historyRows.length > 0
        ? historyRows.map((row) => ({ role: row.role, content: row.content }) as ChatMessage)
        : [{ role: 'user', content: OPENING_TURN_CONTENT }];

    const tools = buildPuzzleSessionTools({ userId: session.userId, assignmentId: session.assignmentId, currentItemIndex }, { db: deps.db });

    return runCoachTurn({
      resolution,
      instructions,
      messages,
      tools,
      timeouts: streamTimeoutsFor(deps.gatewayConfig),
      // Same shape as play mode's stopOnToolNames (coach-agent-turn.ts):
      // advance_puzzle is a server tool whose result decides what happens
      // next, so the turn must end the instant it's called rather than
      // let the model keep talking against a puzzle it's already left.
      stopOnToolNames: ['advance_puzzle'],
      onFinish: async (completion) => {
        // Response already piped to the client by now (routes/puzzle-
        // sessions.ts's reply.hijack()) — same "must never throw" contract
        // as coach-agent-turn.ts's onFinish.
        try {
          for (const message of completion.messages) {
            await puzzleSessionsRepo.insertMessage(deps.db, session.id, message.role, message.content, currentItemIndex);
          }

          const advanced = findSuccessfulToolResult(completion.messages, 'advance_puzzle') as AdvancePuzzleToolResult | null;
          if (advanced) {
            if (advanced.isLastItem) {
              await puzzleSessionsRepo.markCompleted(deps.db, session.id);
              await puzzleAssignmentsRepo.markCompleted(deps.db, session.assignmentId);
            } else {
              await puzzleSessionsRepo.advanceItemIndex(deps.db, session.id, advanced.itemIndex + 1);
            }
          }

          await recordUsage(deps.db, {
            userId: session.userId,
            sessionId: session.id,
            provider: resolution.provider,
            model: resolution.modelId,
            tier: 'standard',
            usage: toBillableTokens(completion.usage),
            purpose: 'puzzle_turn',
            metered: resolution.metered
          });
        } catch (error) {
          console.error(`puzzle-session-turn onFinish failed for session ${session.id}:`, error);
        } finally {
          releaseOnce();
        }
      },
      onError: (error) => {
        console.error(`puzzle-session-turn stream error for session ${session.id}:`, error);
        releaseOnce();
      },
      onAbort: () => {
        releaseOnce();
      }
    });
  } catch (error) {
    releaseOnce();
    throw error;
  }
}
