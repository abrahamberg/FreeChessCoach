import { Chess } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { classifyLiveMove, cpToWords, mateToWords, toCpWhite, type EditableTree } from '@freechesscoach/chess-analysis';
import { HintMovesResponseSchema, type ClassifiedMoveDto, type EngineEval, type EngineLine } from '@freechesscoach/shared';
import { apiPost } from '../../api/client.js';
import type { BoardArrow, BoardHighlight } from '../board/CoachBoard.js';
import { candidateMoveHighlightFromColor } from '../board/candidateMoveColors.js';
import { arrowsFromLines } from '../board/useExploreFeedback.js';
import { reviewOrder } from './review-order.js';

export interface LiveReview {
  /** The engine's verdict on every move it has looked at, by node id. */
  scored: Record<string, ClassifiedMoveDto>;
  /** The verdict on the move on the board; undefined until both its positions are in. */
  note: ClassifiedMoveDto | undefined;
  /** Words only, for the position on the board; null before the engine has answered. */
  evaluation: string | null;
  /** White's centipawns for the position on the board. */
  evalCp: number | null;
  /** The engine's best moves from the position on the board. */
  arrows: BoardArrow[];
  highlights: BoardHighlight[];
  /** Positions still to look at, the one in flight included. */
  pending: number;
  /** Positions the engine could not answer; `retry` asks again. */
  failed: number;
  retry: () => void;
}

/** The engine's best move in a dark green, the other good ones in a lighter one, so the best is never in doubt. */
const BEST_MOVE_COLOR = 'color-mix(in srgb, var(--quality-best) 70%, black)';
const ALTERNATIVE_MOVE_COLOR = 'color-mix(in srgb, var(--quality-best) 45%, white)';

function sideToMove(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

function engineEval(fen: string, lines: EngineLine[]): EngineEval {
  return { ply: 0, fen, depth: 1, lines };
}

function isOver(fen: string): boolean {
  try {
    return new Chess(fen).isGameOver();
  } catch {
    return true;
  }
}

async function fetchLines(fen: string): Promise<EngineLine[]> {
  if (isOver(fen)) return [];
  const { lines } = await apiPost('/api/positions/hint-moves', { fen }, HintMovesResponseSchema);
  return lines;
}

/**
 * A live review of a move tree: every position in it gets the engine's lines,
 * one request at a time, and each move is rated with the same pure
 * classification a stored game gets (classifyLiveMove). The next position is
 * picked after each answer, so the request in flight always finishes and the
 * rest are done in `reviewOrder`: the move on the board, the move played last,
 * then the moves between. Nothing is stored; lines are kept by position for as
 * long as the page lives, so moving back to a move costs nothing.
 */
export function useLiveReview(tree: EditableTree, currentId: string | null, latestId: string | null, enabled: boolean, include?: (nodeId: string) => boolean): LiveReview {
  const lines = useRef(new Map<string, EngineLine[]>());
  const failedFens = useRef(new Set<string>());
  const rated = useRef(new Map<string, ClassifiedMoveDto | null>());
  const [version, setVersion] = useState(0);
  const want = useRef({ tree, currentId, latestId, enabled, include });
  want.current = { tree, currentId, latestId, enabled, include };
  const running = useRef(false);

  const todo = (): string[] => {
    const wanted = want.current;
    return reviewOrder(wanted.tree, wanted.currentId, wanted.latestId, wanted.include).filter((fen) => !lines.current.has(fen) && !failedFens.current.has(fen));
  };

  const drain = useCallback((): void => {
    if (running.current) return;
    running.current = true;
    void (async () => {
      try {
        while (want.current.enabled) {
          const next = todo()[0];
          if (next === undefined) return;
          try {
            lines.current.set(next, await fetchLines(next));
          } catch {
            failedFens.current.add(next);
          }
          setVersion((current) => current + 1);
        }
      } finally {
        running.current = false;
      }
    })();
  }, []);

  // A loop already going picks the change up itself after its request.
  useEffect(drain, [drain, tree, currentId, latestId, enabled]);

  const retry = useCallback((): void => {
    failedFens.current.clear();
    setVersion((current) => current + 1);
    drain();
  }, [drain]);

  const scored = useMemo(() => {
    const byId = new Map(tree.nodes.map((node) => [node.id, node]));
    const result: Record<string, ClassifiedMoveDto> = {};
    for (const node of tree.nodes) {
      const fenBefore = (node.parentId === null ? undefined : byId.get(node.parentId)?.fenAfter) ?? tree.startFen;
      const before = lines.current.get(fenBefore);
      const after = lines.current.get(node.fenAfter);
      if (!before || !after) continue;
      const key = `${fenBefore} ${node.san}`;
      if (!rated.current.has(key)) rated.current.set(key, rate(fenBefore, node.san, node.fenAfter, before, after));
      const move = rated.current.get(key);
      if (move) result[node.id] = move;
    }
    return result;
    // `version` is the lines' change: the refs themselves are not state.
  }, [tree, version]);

  const fen = (currentId === null ? undefined : tree.nodes.find((node) => node.id === currentId)?.fenAfter) ?? tree.startFen;
  const here = lines.current.get(fen);
  const top = here?.[0];
  const arrows = (here ? arrowsFromLines(here, sideToMove(fen)) : []).map((arrow, index) => ({ ...arrow, color: index === 0 ? BEST_MOVE_COLOR : ALTERNATIVE_MOVE_COLOR }));
  const pending = enabled ? todo().length : 0;

  return {
    scored,
    note: currentId === null ? undefined : scored[currentId],
    evaluation: top ? (top.mateIn !== null ? mateToWords(top.mateIn, 'w') : cpToWords(top.cp ?? 0, 'w')) : null,
    evalCp: top ? toCpWhite({ cp: top.cp, mateIn: top.mateIn }) : null,
    arrows,
    highlights: arrows.map((arrow) => ({ square: arrow.to, color: candidateMoveHighlightFromColor(arrow.color) })),
    pending,
    failed: failedFens.current.size,
    retry
  };
}

function rate(fenBefore: string, san: string, fenAfter: string, before: EngineLine[], after: EngineLine[]): ClassifiedMoveDto | null {
  try {
    const mover = sideToMove(fenBefore);
    return classifyLiveMove({
      ply: 0,
      moveSan: san,
      mover,
      fenBefore,
      fenAfter,
      evalBefore: engineEval(fenBefore, before),
      evalAfter: engineEval(fenAfter, after),
      userColor: mover
    });
  } catch {
    return null;
  }
}
