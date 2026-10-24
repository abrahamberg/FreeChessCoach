import { childrenOf, mainLine, pathTo, type EditableTree } from '@freechesscoach/chess-analysis';
import { UserProfileSchema, type ClassifiedMoveDto } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { apiGet } from '../../api/client.js';
import { useEngineActivityIndicator } from '../../hooks/useEngineActivityIndicator.js';
import { useShowLegalMoveDots } from '../../hooks/useShowLegalMoveDots.js';
import { CoachBoard } from '../board/CoachBoard.js';
import { EvalBar } from '../board/EvalBar.js';
import { GameEvalChart } from '../board/GameEvalChart.js';
import { MoveExplorer } from '../board/MoveExplorer.js';
import { MoveNavStrip } from '../board/MoveNavStrip.js';
import { useMoveTree } from '../board/useMoveTree.js';
import { stripPath } from '../board/variation-path.js';
import { tacticSelectionOverlay, toggleTacticSelection, type TacticSelectionKey } from '../board/tacticSelection.js';
import { MoveNoteCard } from '../review/MoveNoteCard.js';
import { SessionHeader } from '../session/SessionHeader.js';
import { latestNodeId } from './review-order.js';
import { useLiveReview } from './useLiveReview.js';
import './LiveReview.css';
import '../../styles/board-bottom-bar.css';
import '../review/GameReviewPage.css';
import '../session/SessionPage.css';

export interface LiveReviewViewProps {
  /** The position and moves to open with: a start position with no moves, or a game. */
  base: EditableTree;
  /** The node the board opens on; the start by default. */
  openAt?: string | null;
  orientation: 'white' | 'black';
  isDesktop: boolean;
  onBack: () => void;
}

/** Game Review's own page (header, move list, board with eval bar and graph,
 * the move's note, the phone's move strip) on a board that takes moves: each
 * one dropped on it joins the move tree, and the engine rates it in the
 * background (useLiveReview) with the best moves drawn as arrows. Nothing is
 * stored: leaving drops the tree and every verdict. Used under a course's
 * lesson and by the temporary review page. */
export function LiveReviewView({ base, openAt = null, orientation, isDesktop, onBack }: LiveReviewViewProps): ReactNode {
  const moveTree = useMoveTree(base, openAt);
  const { tree, currentId } = moveTree;
  const review = useLiveReview(tree, currentId, latestNodeId(tree), true);
  const [showLegalMoveDots] = useShowLegalMoveDots();
  const engineActivity = useEngineActivityIndicator();
  const profile = useQuery({ queryKey: ['profile'], queryFn: ({ signal }) => apiGet('/api/users/me', UserProfileSchema, signal) });
  // The tactic sentence whose arrows are drawn belongs to one move; another move clears it.
  const [selected, setSelected] = useState<{ id: string | null; key: TacticSelectionKey }>({ id: null, key: null });
  const tacticSelection = selected.id === currentId ? selected.key : null;

  const node = currentId === null ? null : (tree.nodes.find((each) => each.id === currentId) ?? null);
  const fen = node?.fenAfter ?? tree.startFen;
  const strip = stripPath(tree, currentId);
  // The line on the strip with each rated move at its place, for the strip and the graph.
  const rated: ClassifiedMoveDto[] = strip.nodeIds.flatMap((id, index) => (review.scored[id] ? [{ ...review.scored[id], ply: index + 1 }] : []));
  const tacticOverlay = tacticSelectionOverlay(review.note, tacticSelection);
  const lastMove = node ? [node.uci.slice(0, 2), node.uci.slice(2, 4)].map((square) => ({ square, color: 'var(--last-move)' })) : [];

  const board = (
    <div className="session-board-column">
      <div className="session-board-row">
        <EvalBar ply={0} classifiedMoves={[]} orientation={orientation} cpOverride={review.evalCp ?? undefined} />
        <CoachBoard
          fen={fen}
          orientation={orientation}
          mode="peek"
          isExploring={currentId !== null && !mainLine(tree).some((each) => each.id === currentId)}
          arrows={[...tacticOverlay.arrows, ...review.arrows]}
          highlights={[...lastMove, ...tacticOverlay.highlights, ...review.highlights]}
          onLocalMove={(_fen, move) => moveTree.play(move.san)}
          moveQualityBadge={node && review.note ? { square: node.uci.slice(2, 4), quality: review.note.quality } : undefined}
          showLegalMoveDots={showLegalMoveDots}
        />
      </div>
      {isDesktop && rated.length > 0 && <GameEvalChart classifiedMoves={rated} currentPly={strip.ply} onSelect={(ply) => moveTree.select(strip.nodeIds[ply - 1] ?? null)} />}
    </div>
  );

  const noteCard = (
    <MoveNoteCard
      ply={node ? pathTo(tree, node.id).length : 0}
      san={node?.san ?? null}
      move={review.note}
      coachPersona={profile.data?.coachPersona ?? 'general'}
      tacticSelection={tacticSelection}
      onToggleTacticSelection={(key) => setSelected({ id: currentId, key: toggleTacticSelection(tacticSelection, key) })}
      pgnComment={node?.comment ?? null}
    />
  );

  return (
    <div className="game-review-page">
      <SessionHeader whiteName="White" blackName="Black" result={null} onBack={onBack} engineActivity={engineActivity} />
      {isDesktop ? (
        <div className="game-review-body desktop">
          <div className="game-review-explorer-column">
            <MoveExplorer tree={tree} currentNodeId={currentId} onSelect={moveTree.select} qualities={review.scored} showNotes={false} wholeMainLine onRemoveBranch={moveTree.remove} onPromoteBranch={moveTree.promote} />
          </div>
          {board}
          <div className="game-review-notes-column">{noteCard}</div>
        </div>
      ) : (
        <div className="game-review-body mobile">
          {noteCard}
          {board}
          <MoveNavStrip
            sanMoves={strip.sanMoves}
            classifiedMoves={rated}
            positions={strip.positions}
            ply={strip.ply}
            variationFromIndex={strip.variationFromIndex}
            onSelect={(stripPly) => moveTree.select(strip.nodeIds[stripPly - 1] ?? null)}
          />
          <OtherMoves tree={tree} currentId={currentId} onSelect={moveTree.select} />
        </div>
      )}
    </div>
  );
}

/** The phone has no move list with its variations, so the other moves from
 * here (the board's own alternatives, and the ones that follow it) are chips
 * under the strip. */
function OtherMoves({ tree, currentId, onSelect }: { tree: EditableTree; currentId: string | null; onSelect: (nodeId: string) => void }): ReactNode {
  const node = currentId === null ? null : tree.nodes.find((each) => each.id === currentId);
  const siblings = node ? childrenOf(tree, node.parentId).filter((each) => each.id !== node.id) : [];
  const next = childrenOf(tree, currentId).slice(1);
  const others = [...siblings, ...next];
  if (others.length === 0) return null;
  return (
    <div className="live-review__others" aria-label="Other moves from here">
      <span className="live-review__others-label">Other lines</span>
      {others.map((each) => (
        <button key={each.id} type="button" className="btn-secondary" onClick={() => onSelect(each.id)}>
          {each.san}
        </button>
      ))}
    </div>
  );
}
