import { classifyLiveMove } from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto, EngineEval } from '@freechesscoach/shared';
import { getSharedLiteEngineWorker } from '../../../engine/shared-engine-worker-instance.js';
import { toPositionAnalysisLine } from '../../../engine/tunnel-engine-handlers.js';

/** Enough to rate one move against the best; capped in time for slow phones. */
const SEARCH = { depth: 14, multiPv: 3, movetimeMs: 2500 };

async function evalOf(fen: string): Promise<EngineEval> {
  const lines = await getSharedLiteEngineWorker().analyze({ fen, ...SEARCH });
  return { ply: 0, fen, depth: SEARCH.depth, lines: lines.map((line) => toPositionAnalysisLine(fen, line)) };
}

/** docs/courses.md §11: a quiz move that isn't the course's, rated with no
 * AI and no server: the small engine in the learner's browser, then the
 * same classifier game review uses (the quality label and its checked
 * tactic sentence). */
export async function judgeQuizMove(move: { fenBefore: string; fenAfter: string; san: string; mover: 'white' | 'black' }): Promise<ClassifiedMoveDto> {
  const evalBefore = await evalOf(move.fenBefore);
  const evalAfter = await evalOf(move.fenAfter);
  return classifyLiveMove({
    ply: 0,
    moveSan: move.san,
    mover: move.mover,
    fenBefore: move.fenBefore,
    fenAfter: move.fenAfter,
    evalBefore,
    evalAfter,
    userColor: move.mover
  });
}
