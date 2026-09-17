import { useEffect, useRef, useState } from 'react';
import { classifyLiveMove, toCpWhite, winPctFor } from '@freechesscoach/chess-analysis';
import { HintMovesResponseSchema, type ClassifiedMoveDto, type EngineEval, type EngineLine } from '@freechesscoach/shared';
import { apiPost } from '../../api/client.js';
import { cpToWords, mateToWords } from '../../engine/eval-words.js';
import type { BoardArrow } from './CoachBoard.js';
import { candidateMoveColor } from './candidateMoveColors.js';

export const EXPLORE_ARROW_MAX_COUNT = 3;
// The same "still basically the same result" band packages/chess-analysis's
// own 'excellent' severity tier uses (config.ts's excellentMaxDrop, in win%
// points) — a candidate line within this many win% points of the top one
// reads as a real alternative, not a worse try padding out the arrow count.
const EXPLORE_ARROW_TOLERANCE_WIN_PCT = 2;

export interface ExploreLastMove {
  fenBefore: string;
  san: string;
  mover: 'white' | 'black';
}

export type ExploreFeedbackStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseExploreFeedbackResult {
  status: ExploreFeedbackStatus;
  /** Word-based only, never a number — see cpToWords/mateToWords. */
  evaluation: string | null;
  /** White-perspective cp of the *current* position (same convention
   * ClassifiedMoveDto.evalAfterCp uses) — for feeding EvalBar/GameEvalChart-
   * style numeric displays, which (unlike the Explore pill's own word-only
   * `evaluation`) already show a plain number elsewhere in this app (Game
   * Review's EvalBar). Null before the first fetch resolves. */
  evalCp: number | null;
  arrows: BoardArrow[];
  /** Set once `lastMove` is known and both its before/after positions have
   * been analyzed — undefined while the student is just looking around
   * (nothing played yet) or a request is still in flight. */
  note: ClassifiedMoveDto | undefined;
}

function sideToMove(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

function toEngineEval(fen: string, lines: EngineLine[]): EngineEval {
  return { ply: 0, fen, depth: 1, lines };
}

async function fetchLines(fen: string): Promise<EngineLine[]> {
  const { lines } = await apiPost('/api/positions/hint-moves', { fen }, HintMovesResponseSchema);
  return lines;
}

/** Up to EXPLORE_ARROW_MAX_COUNT arrows for the engine's best replies from
 * the current position, dropping any candidate whose win% trails the top
 * line by more than the tolerance instead of padding the arrow count with
 * moves that are actually worse. `lines` is already sorted best-first by
 * the server. */
export function arrowsFromLines(lines: EngineLine[], mover: 'white' | 'black'): BoardArrow[] {
  const top = lines[0];
  if (!top) return [];
  const topWinPct = winPctFor(mover, toCpWhite({ cp: top.cp, mateIn: top.mateIn }));
  return lines
    .filter((line) => topWinPct - winPctFor(mover, toCpWhite({ cp: line.cp, mateIn: line.mateIn })) <= EXPLORE_ARROW_TOLERANCE_WIN_PCT)
    .slice(0, EXPLORE_ARROW_MAX_COUNT)
    .map((line, index) => ({ from: line.moveUci.slice(0, 2), to: line.moveUci.slice(2, 4), color: candidateMoveColor(index) }));
}

/**
 * Real engine-pipeline feedback for the Explore panel's sandbox: eval, up to
 * three best-reply arrows, and — once the student has actually played a
 * local move in the sandbox — a coach-box note classifying it, via the same
 * server engine backend (POST /api/positions/hint-moves) and pure
 * classification pipeline (classifyLiveMove) real game analysis uses. Runs
 * only while `enabled` (the Explore pill is open) and re-fetches on every
 * position change so feedback never goes stale after a move.
 */
export function useExploreFeedback(options: { enabled: boolean; fen: string; lastMove: ExploreLastMove | null }): UseExploreFeedbackResult {
  const { enabled, fen, lastMove } = options;
  const [status, setStatus] = useState<ExploreFeedbackStatus>('idle');
  const [evaluation, setEvaluation] = useState<string | null>(null);
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [note, setNote] = useState<ClassifiedMoveDto | undefined>(undefined);
  // The previous call's own lines, reused as `lastMove`'s evalBefore when the
  // student is stepping forward one move at a time (the common case) so a
  // sequential exploration only ever costs one new request per move instead
  // of two.
  const cacheRef = useRef<{ fen: string; lines: EngineLine[] } | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled || !fen) {
      // Closing the sandbox (or a stale fen) must drop whatever feedback was
      // showing immediately — otherwise the last position's arrows/note
      // linger on screen after the student has already left peek mode.
      requestIdRef.current += 1;
      cacheRef.current = null;
      setStatus('idle');
      setEvaluation(null);
      setEvalCp(null);
      setArrows([]);
      setNote(undefined);
      return;
    }
    const requestId = ++requestIdRef.current;
    setStatus('loading');

    async function run(): Promise<void> {
      const cached = cacheRef.current;
      const cachedBeforeLines = lastMove && cached?.fen === lastMove.fenBefore ? cached.lines : undefined;
      const [currentLines, beforeLines] = await Promise.all([
        fetchLines(fen),
        cachedBeforeLines ? Promise.resolve(cachedBeforeLines) : lastMove ? fetchLines(lastMove.fenBefore) : Promise.resolve(undefined)
      ]);
      if (requestIdRef.current !== requestId) return;

      cacheRef.current = { fen, lines: currentLines };
      const mover = sideToMove(fen);
      const top = currentLines[0];
      setEvaluation(top ? (top.mateIn !== null ? mateToWords(top.mateIn, 'w') : cpToWords(top.cp ?? 0, 'w')) : null);
      setEvalCp(top ? toCpWhite({ cp: top.cp, mateIn: top.mateIn }) : null);
      setArrows(arrowsFromLines(currentLines, mover));
      setNote(
        lastMove && beforeLines
          ? classifyLiveMove({
              ply: 0,
              moveSan: lastMove.san,
              mover: lastMove.mover,
              fenBefore: lastMove.fenBefore,
              fenAfter: fen,
              evalBefore: toEngineEval(lastMove.fenBefore, beforeLines),
              evalAfter: toEngineEval(fen, currentLines),
              userColor: lastMove.mover
            })
          : undefined
      );
      setStatus('ready');
    }

    run().catch(() => {
      if (requestIdRef.current === requestId) setStatus('error');
    });
  }, [enabled, fen, lastMove?.fenBefore, lastMove?.san, lastMove?.mover]);

  return { status, evaluation, evalCp, arrows, note };
}
