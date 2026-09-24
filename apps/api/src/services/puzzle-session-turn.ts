import { buildPuzzleCoachSystemPrompt, renderEngineAnalysisSummary } from '@freechesscoach/prompts';
import type { PositionAnalysis } from '@freechesscoach/shared';
import type { ClientToolResult } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as usersRepo from '../db/repositories/users.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import type { PuzzleSessionRow } from '../db/repositories/puzzle-sessions.js';
import type { Database } from '../db/schema.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { createKeyedLock } from '../lib/keyedLock.js';
import { MAX_STEPS, runCoachTurn, type CoachTurnStream } from '../llm/chat.js';
import type { GatewayConfig, ModelResolution, Tier } from '../llm/gateway.js';
import { getModelForUser, streamTimeoutsFor } from '../llm/gateway.js';
import { cachedSystemMessage, systemMessage, type ChatMessage } from '../llm/messages.js';
import { serializeTools, type TurnDebugSnapshot } from './coach-agent-debug.js';
import { currentPuzzleFen } from './puzzle-session.js';
import { buildPuzzleSessionTools } from './puzzle-session-tools.js';

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
  /** The student's engine (cached backend). Absent when no engine is configured — the coach then works from the line notes alone. */
  analyzePosition?: (fen: string) => Promise<PositionAnalysis>;
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

/** Each practice position is its own episode: the model sees only the
 * messages tagged with the current item (plus a short results ledger in the
 * system prompt), never the previous positions' conversations. Otherwise the
 * next position opens on the last one's tool result and the coach carries on
 * as if it were still there. */
function openingTurnContent(itemIndex: number, total: number): string {
  return itemIndex === 0 ? OPENING_TURN_CONTENT : `Begin practice ${itemIndex + 1} of ${total}.`;
}

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

    const user = await usersRepo.findById(deps.db, session.userId);
    if (!user) throw new NotFoundError('User not found');
    const positionAnalysis = await analyseCurrentPosition(deps, session, assignment);

    const { staticPart, dynamicPart } = buildPuzzleCoachSystemPrompt({
      persona: user.coachPersona,
      displayName: user.displayName,
      positionAnalysis,
      reason: assignment.reason,
      previousResults: assignment.items.slice(0, currentItemIndex).map((item, index) => ({ index: index + 1, result: item.result })),
      totalCount: assignment.items.length,
      currentItem: { fen: currentItem.fen, moves: currentItem.moves, themes: currentItem.themes, index: currentItemIndex + 1, currentPly: session.currentPly }
    });
    const instructions = [cachedSystemMessage(staticPart), systemMessage(dynamicPart)];

    const historyRows = (await puzzleSessionsRepo.listMessagesBySession(deps.db, session.id)).filter(
      (row) => row.itemIndex === currentItemIndex
    );
    const history = historyRows.map((row) => ({ role: row.role, content: row.content }) as ChatMessage);
    // The synthesized opening turn is never persisted, so an episode's stored
    // history starts with the coach's own reply — put the opening back in
    // front so the conversation always begins with a user turn.
    const messages: ChatMessage[] =
      history[0]?.role === 'user'
        ? history
        : [{ role: 'user', content: openingTurnContent(currentItemIndex, assignment.items.length) }, ...history];

    const tools = buildPuzzleSessionTools(
      { userId: session.userId, assignmentId: session.assignmentId, sessionId: session.id, currentItemIndex },
      { db: deps.db, analyzePosition: deps.analyzePosition }
    );

    return runCoachTurn({
      resolution,
      instructions,
      messages,
      tools,
      timeouts: streamTimeoutsFor(deps.gatewayConfig, resolution),
      // Same shape as play mode's stopOnToolNames (coach-agent-turn.ts):
      // advance_puzzle is a server tool whose result decides what happens
      // next, so the turn must end the instant it's called rather than
      // let the model keep talking against a puzzle it's already left.
      stopOnToolNames: ['advance_puzzle'],
      onFinish: async (completion) => {
        // Response already piped to the client by now (routes/puzzle-
        // sessions.ts's reply.hijack()) — same "must never throw" contract
        // as coach-agent-turn.ts's onFinish. advance_puzzle's own session/
        // assignment write already happened synchronously inside the tool's
        // execute (puzzle-item-advance.ts) — nothing left to do here beyond
        // persisting the turn's messages.
        try {
          // Debug snapshot is best-effort: a failure here must never lose the
          // transcript persisted below.
          try {
            await puzzleSessionsRepo.updateDebugSnapshot(deps.db, session.id, {
              request: {
                provider: resolution.isLocal ? 'local' : resolution.provider,
                model: resolution.modelId,
                instructions,
                messages,
                tools: serializeTools(tools),
                maxSteps: MAX_STEPS,
                reasoning: resolution.callOptions.reasoning,
                providerOptions: resolution.callOptions.providerOptions ?? null
              },
              response: {
                messages: completion.messages,
                finishReason: completion.finishReason,
                usage: completion.usage,
                providerMetadata: completion.providerMetadata
              }
            } satisfies TurnDebugSnapshot);
          } catch (snapshotError) {
            console.error(`puzzle-session-turn debug snapshot failed for session ${session.id}:`, snapshotError);
          }
          for (const message of completion.messages) {
            await puzzleSessionsRepo.insertMessage(deps.db, session.id, message.role, message.content, currentItemIndex);
          }
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

/** The engine's digest of the live position, so the coach starts every turn
 * with the position's analysis in hand (the game coach gets the same).
 * Best-effort: an unreachable engine must not stop the conversation. */
async function analyseCurrentPosition(
  deps: PuzzleTurnDependencies,
  session: PuzzleSessionRow,
  assignment: puzzleAssignmentsRepo.PuzzleAssignmentRow
): Promise<string | null> {
  if (!deps.analyzePosition) return null;
  try {
    return renderEngineAnalysisSummary(await deps.analyzePosition(currentPuzzleFen(session, assignment)));
  } catch (error) {
    console.error(`puzzle-session-turn engine analysis failed for session ${session.id}:`, error);
    return null;
  }
}
