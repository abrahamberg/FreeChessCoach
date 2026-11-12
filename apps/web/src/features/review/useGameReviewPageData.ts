import { parsePgn } from '@freechesscoach/chess-analysis';
import type { MoveQuality } from '@freechesscoach/shared';
import { useMemo, useState } from 'react';
import type { BoardArrow } from '../board/CoachBoard.js';
import { anchorPly, gameTree, isMainNode, mainNodeAtPly, qualitiesByMainNode } from '../board/move-tree-state.js';
import { useMoveTree } from '../board/useMoveTree.js';
import { sanToSquares } from '../board/sanToSquares.js';
import { tacticSelectionOverlay, toggleTacticSelection, type TacticSelectionKey } from '../board/tacticSelection.js';
import { lastMoveHighlightsFor } from '../session/useSessionBoardState.js';
import type { ReviewedGame } from './reviewed-game.js';

/** MoveQualityBadgeOverlay's on-board badge for the current ply — the
 * square the move landed on plus its quality tier, or `undefined` to draw
 * nothing — see that component's own doc comment. One combined value (not
 * a square alone that CoachBoard then has to re-pair with the move's
 * quality) since the two only ever mean anything together. Exported for
 * direct unit testing rather than only through the whole hook. */
export function moveQualityBadgeFor(
  quality: MoveQuality | undefined,
  moveUci: string | null | undefined
): { square: string; quality: MoveQuality } | undefined {
  if (!quality || !moveUci) return undefined;
  return { square: moveUci.slice(2, 4), quality };
}

/** All derived state for the Game Review page (AGENTS.md rule 7) — the
 * view itself stays presentational. Unlike useSessionPageData, there is no
 * session/chat here at all: this reads a reviewed game (a stored analysis,
 * `useStoredGame`, or the no-account review run in the browser) and just
 * lets the student step through it move by move — no coach turn, no LLM
 * call, no fetch. */
export function useGameReviewPageData(game: ReviewedGame) {
  // The game's move tree: its main line is what the analysis is keyed to, and
  // the moves the student explores stay in it as variations until they leave.
  const { pgn, classifiedMoves } = game;
  const baseTree = useMemo(() => {
    const parsed = parsePgn(pgn);
    const sans = parsed.positions.filter((position) => position.moveSan !== null).map((position) => position.moveSan as string);
    return gameTree(parsed.positions[0]?.fen ?? '', sans, pgn);
  }, [pgn]);
  const moveTree = useMoveTree(baseTree);
  const currentNode = moveTree.currentId === null ? null : (moveTree.tree.nodes.find((node) => node.id === moveTree.currentId) ?? null);
  const inVariation = currentNode !== null && !isMainNode(moveTree.tree, currentNode.id);
  // The game's own ply the board is on, or the one a variation branches from.
  const ply = anchorPly(moveTree.tree, moveTree.currentId);
  const setPly = (next: number): void => moveTree.select(mainNodeAtPly(moveTree.tree, next));

  // Which tactic sentence's arrow (if any) MoveNoteCard has selected —
  // reset on every ply change (Daniel's call: "moving to next move resets
  // the arrows"), regardless of which nav control changed it (MoveNavPills,
  // MoveStrip, MoveExplorer, or the board's own move-list clicks all funnel
  // through `setPly`). Reset inline during render (the "adjusting state
  // when a prop changes" pattern), not in a useEffect: an effect only runs
  // after the ply-changed render has already committed and painted, so for
  // one frame `tacticSelection` would still be the old ply's key applied
  // against the new ply's tactic data — exactly the stale-arrow flash this
  // is meant to prevent.
  const [tacticSelectionPly, setTacticSelectionPly] = useState(ply);
  const [tacticSelection, setTacticSelection] = useState<TacticSelectionKey>(null);
  if (ply !== tacticSelectionPly) {
    setTacticSelectionPly(ply);
    setTacticSelection(null);
  }
  function toggleTacticSelectionKey(key: Exclude<TacticSelectionKey, null>): void {
    setTacticSelection((current) => toggleTacticSelection(current, key));
  }

  const positions = useMemo(() => parsePgn(pgn).positions, [pgn]);
  const sanMoves = positions.filter((position) => position.moveSan !== null).map((position) => position.moveSan as string);

  // A variation move has no stored analysis: the explore feedback speaks for it.
  const currentMove = inVariation ? undefined : classifiedMoves.find((move) => move.ply === ply);
  const qualities = useMemo(() => qualitiesByMainNode(moveTree.tree, classifiedMoves), [moveTree.tree, classifiedMoves]);

  // Always the real, actual position (never a "before this move" replay —
  // Daniel's call: the board should never travel anywhere the game didn't
  // actually go). The board itself always tells the truth about what
  // happened; a best-move arrow is only drawn on top of it in the one case
  // where doing so can't mislead — see `arrows` below.
  const currentPosition = positions.find((position) => position.ply === ply) ?? positions[0];
  // In a variation the board shows the variation's move instead.
  const fen = currentNode && inVariation ? currentNode.fenAfter : (currentPosition?.fen ?? '');
  const shownMoveUci = currentNode && inVariation ? currentNode.uci : currentPosition?.moveUci;
  // The selected tactic sentence's own geometry (tacticSelectionOverlay) on
  // top of the last-move highlight — both are just square/color pairs the
  // board merges the same way, so there's nothing to reconcile between them.
  const tacticOverlay = tacticSelectionOverlay(currentMove, tacticSelection);
  const highlights = [...lastMoveHighlightsFor(shownMoveUci), ...tacticOverlay.highlights];
  // Every classified move gets its quality badge echoed on the board too,
  // on the square it landed on — see MoveQualityBadgeOverlay.
  const moveQualityBadge = moveQualityBadgeFor(currentMove?.quality, shownMoveUci);

  // The one visual for "what was actually best" — MoveNoteCard no longer
  // spells it out as a "Best: <line>" sentence (Daniel's call: obvious once
  // it's drawn). bestMoveSan is resolved against fenBefore (the position
  // the choice was actually made from) purely to get its from/to squares;
  // the arrow itself is drawn on `fen` above, the real current position, so
  // its origin square won't always still hold the piece it names — an
  // accepted trade-off of never replaying a "before" state to show it on.
  // --annotate-2 (blue) rather than any --quality-* color, so it never
  // reads as a quality judgment the way the note card's own accent border
  // does — it's a suggestion, not a verdict.
  const arrows: BoardArrow[] = [...tacticOverlay.arrows];
  if (currentMove?.bestMoveSan && currentMove.bestMoveSan !== currentMove.moveSan && currentMove.fenBefore) {
    const best = sanToSquares(currentMove.fenBefore, currentMove.bestMoveSan);
    if (best) arrows.push({ from: best.from, to: best.to, color: 'var(--annotate-2)' });
  }

  return {
    positions,
    sanMoves,
    classifiedMoves,
    currentMove,
    ply,
    setPly,
    fen,
    moveTree,
    currentNode,
    inVariation,
    qualities,
    highlights,
    arrows,
    moveQualityBadge,
    tacticSelection,
    onToggleTacticSelection: toggleTacticSelectionKey
  };
}
