import {
  buildProgressSystemPrompt,
  renderClosingRoundBlock,
  renderOtherMovesSummary,
  renderProgressNotesBlock,
  type ProgressPhase
} from '@freechesscoach/prompts';
import { parseAnnotatedPgn } from '@freechesscoach/chess-analysis';
import { ratingForPromptScoping } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as sessionMessagesRepo from '../db/repositories/session-messages.js';
import * as sessionMoveNotesRepo from '../db/repositories/session-move-notes.js';
import * as sessionProgressNotesRepo from '../db/repositories/session-progress-notes.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import type { SessionRow } from '../db/repositories/sessions.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { isDevCommandsEnabled } from '../lib/dev-commands.js';
import { NotFoundError } from '../lib/errors.js';
import { runCoachTurn, type CoachTurnStream } from '../llm/chat.js';
import { streamTimeoutsFor } from '../llm/gateway.js';
import { classifyLlmError } from '../llm/provider-error.js';
import { cachedSystemMessage, systemMessage, type ChatMessage, type SystemChatMessage } from '../llm/messages.js';
import { toChatMessage, toStoredMessages } from './coach-context-replay.js';
import { serializeTools, toResponseSnapshot, type TurnDebugSnapshot } from './coach-agent-debug.js';
import type { CoachAgentDependencies, ModelResolver } from './coach-agent-types.js';
import { replyInProgress } from './coach-tool-guards.js';
import { buildCoachTools } from './coach-tools.js';
import { buildTurnToolsDependencies } from './coach-turn-dependencies.js';
import { loadProgressDossier } from './progress-dossier.js';

/** A progress round reads the dossier, updates each habit it changed, writes
 * its notes and closes: more model steps than a review reply needs, and the
 * last step is forced to speak, so a short budget would cut the round off
 * before end_session. */
const PROGRESS_MAX_STEPS = 14;

interface ProgressTurnArgs {
  deps: CoachAgentDependencies;
  session: SessionRow;
  content: string | undefined;
  resolution: Awaited<ReturnType<ModelResolver>>;
  callLightModel: (messages: { system: string; user: string }) => Promise<string>;
  resolveModel: ModelResolver;
  /** Releases startTurn's per-session lock once this turn is persisted. */
  releaseOnce: () => void;
}

/**
 * One turn of a progress round (docs/plan.md Phase 128). The round is its own
 * episode: the coach reads the progress dossier and this round's messages and
 * nothing from the game review. The closing round also reads the game's own
 * notes ("## Other moves discussed") and the notes it left during the review,
 * then a closing note saying what the round is for.
 */
export async function startProgressTurn(args: ProgressTurnArgs): Promise<CoachTurnStream> {
  const { deps, session, resolution, releaseOnce } = args;
  const phase = progressPhaseOf(session);

  const context = await buildProgressContext(deps.db, session, phase, resolution.isLocal ?? false);
  if (args.content !== undefined) await sessionMessagesRepo.insert(deps.db, session.id, 'user', args.content, null, phase);
  const history = await sessionMessagesRepo.listForPhase(deps.db, session.id, phase);
  const messages = withPhaseBlockWhenEmpty(history.length === 0, context.phaseBlock, toStoredMessages(history).map(toChatMessage));

  const reply = replyInProgress(messages);
  const tools = buildCoachTools(
    { userId: session.userId, sessionId: session.id, gameId: session.gameId },
    buildTurnToolsDependencies(deps, session, args.callLightModel, args.resolveModel),
    'analyze',
    reply.state,
    phase
  );
  const instructions = context.phaseBlock && history.length > 0 ? [...context.instructions, systemMessage(context.phaseBlock)] : context.instructions;

  return runCoachTurn({
    resolution,
    instructions,
    messages,
    tools,
    timeouts: streamTimeoutsFor(deps.gatewayConfig, resolution),
    speakAfterToolNames: undefined,
    maxSteps: PROGRESS_MAX_STEPS,
    priorSteps: reply.priorSteps,
    onFinish: async (completion) => {
      try {
        await sessionsRepo.updateDebugSnapshot(deps.db, session.id, {
          request: {
            provider: resolution.isLocal ? 'local' : resolution.provider,
            model: resolution.modelId,
            instructions,
            messages,
            tools: serializeTools(tools),
            maxSteps: PROGRESS_MAX_STEPS,
            reasoning: resolution.callOptions.reasoning,
            providerOptions: resolution.callOptions.providerOptions ?? null
          },
          response: toResponseSnapshot(completion)
        } satisfies TurnDebugSnapshot);
        for (const message of completion.messages) {
          await sessionMessagesRepo.insert(deps.db, session.id, message.role, message.content, null, phase);
        }
      } catch (error) {
        console.error(`progress turn onFinish failed for session ${session.id}:`, error);
      } finally {
        releaseOnce();
      }
    },
    onError: (error) => {
      console.error(`progress turn stream error for session ${session.id} [${classifyLlmError(error).logSummary}]:`, error);
      releaseOnce();
    },
    onAbort: releaseOnce
  });
}

function progressPhaseOf(session: SessionRow): ProgressPhase {
  if (session.phase === 'review') throw new Error('startProgressTurn was called for a session in the review');
  return session.phase;
}

/** An empty round has nothing to answer, so the round's instruction becomes
 * the message the coach responds to (the same shape as the review's first turn). */
function withPhaseBlockWhenEmpty(isEmpty: boolean, phaseBlock: string | null, messages: ChatMessage[]): ChatMessage[] {
  return isEmpty && phaseBlock ? [{ role: 'user', content: phaseBlock }] : messages;
}

interface ProgressContext {
  instructions: SystemChatMessage[];
  /** Uncached, after every layer; null when the round needs none. */
  phaseBlock: string | null;
}

async function buildProgressContext(db: Kysely<Database>, session: SessionRow, phase: ProgressPhase, isLocal: boolean): Promise<ProgressContext> {
  const [user, game, dossier, sessionCount, plan] = await Promise.all([
    usersRepo.findById(db, session.userId),
    gamesRepo.findById(db, session.gameId),
    loadProgressDossier(db, session.userId, session.id),
    sessionsRepo.countByUser(db, session.userId),
    analysesRepo.findCoachingPlanByGameId(db, session.gameId)
  ]);
  if (!user) throw new NotFoundError('User not found');
  if (!game) throw new NotFoundError('Game not found');

  const prompt = buildProgressSystemPrompt({
    phase,
    user: { displayName: user.displayName, selfAssessment: user.selfAssessment, sessionCount },
    band: user.ratingBand,
    rating: ratingForPromptScoping(user.rating, user.ratingBand),
    persona: user.coachPersona,
    dossier,
    game:
      phase === 'progress_close'
        ? { whiteName: game.whiteName ?? 'White', blackName: game.blackName ?? 'Black', result: game.result ?? '*', timeControl: game.timeControl ?? 'unknown', userColor: game.userColor }
        : null,
    sessionGoal: plan?.sessionGoal ?? null,
    isLocal,
    devCommands: isDevCommandsEnabled()
  });
  const layers = [cachedSystemMessage(prompt.staticPart), cachedSystemMessage(prompt.dynamicPart)];
  if (phase === 'progress_open') return { instructions: layers, phaseBlock: null };

  const gameNotes = await closingRoundGameNotes(db, session, game.annotatedPgn, game.userColor);
  return { instructions: [...layers, cachedSystemMessage(gameNotes)], phaseBlock: renderClosingRoundBlock(session.subjectPly) };
}

/** What the review left behind, laid out as the review's own context lays it
 * out: the progress notes, then "## Other moves discussed". */
async function closingRoundGameNotes(
  db: Kysely<Database>,
  session: SessionRow,
  annotatedPgn: string | null,
  userColor: 'white' | 'black'
): Promise<string> {
  const [progressNotes, moveNotes] = await Promise.all([
    sessionProgressNotesRepo.listBySession(db, session.id),
    sessionMoveNotesRepo.listAllBySession(db, session.id)
  ]);
  const qualities = annotatedPgn ? parseAnnotatedPgn(annotatedPgn, userColor) : [];
  return [renderProgressNotesBlock(progressNotes), renderOtherMovesSummary(moveNotes, qualities)].join('\n\n');
}
