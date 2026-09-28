import { courseNodeAncestry, courseNodePath, inspectMoves } from '@freechesscoach/chess-analysis';
import {
  buildCourseQuestionSystemPrompt,
  checkMovesParameters,
  coachToolDescription,
  getEngineAnalysisParameters,
  renderEngineAnalysisSummary,
  renderMoveInspection,
  type CourseQuestionPromptInput
} from '@freechesscoach/prompts';
import { COACH_PERSONA_INFO, type AskCourseCoachRequest, type CourseDocument, type CourseKind, type CourseNode, type PositionAnalysis } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import * as coursesRepo from '../../db/repositories/courses.js';
import * as usersRepo from '../../db/repositories/users.js';
import type { Database } from '../../db/schema.js';
import { isDevCommandsEnabled } from '../../lib/dev-commands.js';
import { NotFoundError } from '../../lib/errors.js';
import { runCoachTurn, type CoachTurnStream } from '../../llm/chat.js';
import { getModelForUser, streamTimeoutsFor, type GatewayConfig, type ModelResolution, type Tier } from '../../llm/gateway.js';
import { cachedSystemMessage, systemMessage } from '../../llm/messages.js';
import { classifyLlmError } from '../../llm/provider-error.js';
import { tool, type ToolSet } from '../../llm/tools.js';
import { createTurnGuardState, withTurnGuards } from '../coach-tool-guards.js';

export interface AskCourseCoachDependencies {
  db: Kysely<Database>;
  gatewayConfig: GatewayConfig;
  /** Tests override with a mock model. */
  resolveModel?: (db: Kysely<Database>, gatewayConfig: GatewayConfig, userId: string, tier: Tier) => Promise<ModelResolution>;
  /** The learner's engine; absent without one, and the coach then uses check_moves alone. */
  analyzePosition?: (fen: string) => Promise<PositionAnalysis>;
}

/**
 * docs/courses.md §11: one reply from the learner's OWN coach about one
 * position of a published course. Nothing is stored: the browser holds the
 * short conversation. The course, the position and its facts come from the
 * published copy here, never from the browser.
 */
export async function askCourseCoach(deps: AskCourseCoachDependencies, userId: string, request: AskCourseCoachRequest): Promise<CoachTurnStream> {
  const course = await coursesRepo.findPublishedBySlug(deps.db, request.slug);
  const document = course?.publishedDocument;
  if (!document) throw new NotFoundError('Course not found');
  const position = coursePosition(document, request.episodeId, request.nodeId);
  if (!position) throw new NotFoundError('That position is not in this course');

  const user = await usersRepo.findById(deps.db, userId);
  if (!user) throw new NotFoundError('User not found');
  const resolution = await (deps.resolveModel ?? getModelForUser)(deps.db, deps.gatewayConfig, userId, 'standard');
  const positionAnalysis = await analyse(deps, position.fen);

  const { staticPart, dynamicPart } = buildCourseQuestionSystemPrompt({
    persona: user.coachPersona,
    displayName: user.displayName,
    devCommands: isDevCommandsEnabled(),
    course: {
      title: document.title,
      kind: KIND_WORDS[document.kind],
      courseCoach: COACH_PERSONA_INFO[document.coachPersona].label,
      learnerSide: document.learnerSide
    },
    ...position.prompt,
    positionAnalysis
  });

  const guards = createTurnGuardState();
  const tools: ToolSet = {
    check_moves: tool({
      description: CHECK_MOVES_DESCRIPTION,
      inputSchema: courseCheckMovesParameters,
      execute: withTurnGuards(guards, 'check_moves', (args: z.infer<typeof courseCheckMovesParameters>) =>
        Promise.resolve(renderMoveInspection(inspectMoves(args.fen ?? position.fen, args.moves)))
      )
    }),
    ...(deps.analyzePosition
      ? {
          get_engine_analysis: tool({
            description: coachToolDescription('get_engine_analysis'),
            inputSchema: getEngineAnalysisParameters,
            execute: withTurnGuards(guards, 'get_engine_analysis', async (args: { fen: string }) =>
              renderEngineAnalysisSummary(await deps.analyzePosition!(args.fen))
            )
          })
        }
      : {})
  };

  return runCoachTurn({
    resolution,
    instructions: [cachedSystemMessage(staticPart), systemMessage(dynamicPart)],
    messages: request.messages.map((message) => ({ role: message.role, content: message.content })),
    tools,
    timeouts: streamTimeoutsFor(deps.gatewayConfig, resolution),
    onFinish: () => Promise.resolve(),
    onError: (error) => console.error(`course question stream error for ${request.slug} [${classifyLlmError(error).logSummary}]:`, error),
    onAbort: () => undefined
  });
}

const KIND_WORDS: Record<CourseKind, string> = {
  opening_reel: 'a short opening lesson',
  opening_course: 'an opening course',
  tactics: 'a tactics lesson',
  trap: 'a trap',
  master_game: 'a master game'
};

const CHECK_MOVES_DESCRIPTION =
  'Check whether specific moves are legal in a position and what they actually do: pure board reading, no engine, free. Pass up to 6 moves in SAN; leave fen out to check them in the course position your student is asking about (almost always what you want; never type a fen out yourself). For each: legal or not, what it captures, check or mate, the fen it reaches, what it leaves hanging, any fork. Use it before you judge any move that is not the course\'s next move.';

const courseCheckMovesParameters = checkMovesParameters.extend({
  fen: z.string().min(1).optional().describe('Leave out to check moves in the course position. Pass only a fen a tool gave you.')
});

async function analyse(deps: AskCourseCoachDependencies, fen: string): Promise<string | null> {
  if (!deps.analyzePosition) return null;
  try {
    return renderEngineAnalysisSummary(await deps.analyzePosition(fen));
  } catch (error) {
    console.error('course question engine analysis failed:', error);
    return null;
  }
}

type PositionPrompt = Pick<CourseQuestionPromptInput, 'line' | 'fen' | 'lastMove' | 'courseMove' | 'episodeNotes'>;

/** The position after `nodeId` in the episode (before its first move when
 * null): the moves that led there, the move just played and the course's
 * next one, each with the course's note. Null when not in the episode. */
export function coursePosition(document: CourseDocument, episodeId: string, nodeId: string | null): { fen: string; prompt: PositionPrompt } | null {
  const episode = document.episodes.find((each) => each.id === episodeId);
  if (!episode) return null;
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const path = courseNodePath(document.nodes, episode.startNodeId, episode.endNodeId) ?? [episode.endNodeId];
  const at = nodeId === null ? -1 : path.indexOf(nodeId);
  if (nodeId !== null && at < 0) return null;
  const fenBefore = (node: CourseNode): string => (node.parentId ? byId.get(node.parentId)?.fenAfter : undefined) ?? document.startFen;
  const noteOn = (id: string): string | null => episode.notes.find((note) => note.nodeId === id)?.text.trim() || null;
  const label = (node: CourseNode): string => {
    const [, turn, , , , fullmove] = fenBefore(node).split(' ');
    return `${fullmove ?? '1'}${turn === 'b' ? '...' : '.'}${node.san}`;
  };

  const last = nodeId ? byId.get(nodeId) : undefined;
  const firstId = path[0];
  const first = firstId ? byId.get(firstId) : undefined;
  const fen = last?.fenAfter ?? (first ? fenBefore(first) : document.startFen);
  const lineEnd = last ?? (first?.parentId ? byId.get(first.parentId) : undefined);
  // A scoresheet: "1.d4 e5 2.dxe5", a number on Black's move only when it comes first.
  const line = lineEnd
    ? courseNodeAncestry(byId, lineEnd.id)
        .map((node, index) => (index === 0 || fenBefore(node).split(' ')[1] === 'w' ? label(node) : node.san))
        .join(' ')
    : '';
  const nextId = path[at + 1];
  const next = nextId ? byId.get(nextId) : undefined;
  return {
    fen,
    prompt: {
      line,
      fen,
      lastMove: last ? { san: label(last), note: noteOn(last.id) } : null,
      courseMove: next ? { san: next.san, note: noteOn(next.id) } : null,
      episodeNotes: episode.notes.filter((note) => note.text.trim() && note.nodeId !== last?.id && note.nodeId !== next?.id).flatMap((note) => {
        const node = byId.get(note.nodeId);
        return node ? [`${label(node)}: ${note.text.trim()}`] : [];
      })
    }
  };
}
