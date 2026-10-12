import { useState, type ReactNode } from 'react';
import { childrenOf, gameLine, pathTo, type PgnTree, type PgnTreeNode } from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { ChevronLeftIcon, ChevronRightIcon, SkipBackIcon, SkipForwardIcon } from '../../components/Icon.js';
import { ExplorerAutoplay } from './ExplorerAutoplay.js';
import { ExplorerVariation } from './ExplorerVariation.js';
import { MoveAnalysisModal } from './MoveAnalysisModal.js';
import { AlternativesPanel, MoveNote, OpeningLabel } from './MoveNoteContent.js';
import { MoveQualityBadge } from './MoveQualityBadge.js';
import { TacticMotifBadge } from './TacticMotifBadge.js';
import type { ExplorerNodeExtra, ExplorerNodeExtras } from './explorer-extras.js';
import { explorerRows } from './explorer-rows.js';
import { stripPath } from './variation-path.js';
import './MoveExplorer.css';

export interface MoveExplorerProps {
  /** The moves to show: the main line in numbered rows, every variation as a
   * block under the move it replaces. */
  tree: PgnTree;
  /** The node shown on the board; null is the start position. */
  currentNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
  /** The classified move of each node, by node id. */
  qualities: Record<string, ClassifiedMoveDto>;
  /** The coaching session's desktop layout has nowhere else to show a
   * move's note, so this stays the one place it lives there. The Game
   * Review page's desktop layout has its own dedicated MoveNoteCard column
   * (the same note, shown large) — repeating it here too would just be the
   * same text twice, so that caller passes false. */
  showNotes?: boolean;
  /** This many main-line moves are shown faded: a course episode's lead-in. */
  dimmedThroughPly?: number;
  /** A list to read, not to step through (a course drill's moves so far):
   * no nav pills. */
  hideNav?: boolean;
  /** Removes a variation made in the explorer (the id of its first move). */
  onRemoveBranch?: (nodeId: string) => void;
  /** Badges, a comment tooltip or a fade for moves, by node id. */
  nodeExtras?: ExplorerNodeExtras;
}

/** design.md-adjacent move explorer (not yet in design.md — Daniel requested
 * a chess.com/lichess-style panel): the move tree as paired rows with
 * variation blocks, NAG symbols and quality color-coding from the persisted
 * classification, nav pills, and a plain-language note for the current move.
 * The note lives in a native <details>, open by default — no separate
 * show/hide button, just click the "Notes" summary to collapse it. */
export function MoveExplorer({
  tree,
  currentNodeId,
  onSelect,
  qualities,
  showNotes = true,
  dimmedThroughPly = 0,
  hideNav = false,
  onRemoveBranch,
  nodeExtras
}: MoveExplorerProps): ReactNode {
  const [inspecting, setInspecting] = useState<{ fen: string; label: string } | null>(null);
  const rows = explorerRows(tree);
  const nodeById = new Map(tree.nodes.map((node) => [node.id, node]));
  const game = gameLine(tree);
  const gameIds = new Set(game.map((node) => node.id));
  const dimmedIds = new Set(game.slice(0, dimmedThroughPly).map((node) => node.id));
  const currentMove = currentNodeId === null ? undefined : qualities[currentNodeId];
  const current = currentNodeId === null ? undefined : nodeById.get(currentNodeId);
  const end = lineEnd(tree, current);
  const inVariation = stripPath(tree, currentNodeId).variationFromIndex !== null && currentNodeId !== null && !gameIds.has(currentNodeId);

  function inspect(nodeId: string, label: string): void {
    const node = nodeById.get(nodeId);
    if (node) setInspecting({ fen: node.fenAfter, label });
  }

  return (
    <div className="move-explorer">
      {!hideNav && (
        <div className="move-explorer__nav">
          <button type="button" aria-label="first move" onClick={() => onSelect(null)}>
            <SkipBackIcon width={15} height={15} />
          </button>
          <button type="button" aria-label="previous move" onClick={() => current && onSelect(current.parentId)}>
            <ChevronLeftIcon width={16} height={16} />
          </button>
          <span className="move-explorer__position">
            move {pathTo(tree, currentNodeId ?? '').length} of {pathTo(tree, end?.id ?? '').length}
          </span>
          <button type="button" aria-label="next move" onClick={() => { const next = childrenOf(tree, currentNodeId)[0]; if (next) onSelect(next.id); }}>
            <ChevronRightIcon width={16} height={16} />
          </button>
          <button type="button" aria-label="last move" onClick={() => end && onSelect(end.id)}>
            <SkipForwardIcon width={15} height={15} />
          </button>
        </div>
      )}
      {!hideNav && inVariation && <ExplorerAutoplay tree={tree} currentNodeId={currentNodeId} onSelect={onSelect} />}
      <ol className="move-explorer__list">
        {rows.map((row, index) => {
          if (row.kind === 'variation') {
            return (
              <ExplorerVariation
                key={index}
                row={row}
                qualities={qualities}
                nodeExtras={nodeExtras}
                currentNodeId={currentNodeId}
                onSelect={onSelect}
                onRemove={onRemoveBranch}
              />
            );
          }
          const { moveNumber, white, black } = row;
          return (
            <li key={index}>
              <span className="move-explorer__number">{moveNumber}.</span>
              {white ? (
                <MoveCell
                  nodeId={white.nodeId}
                  san={white.san}
                  move={qualities[white.nodeId]}
                  isCurrent={currentNodeId === white.nodeId}
                  dimmed={dimmedIds.has(white.nodeId) || nodeExtras?.[white.nodeId]?.dimmed === true}
                  extra={nodeExtras?.[white.nodeId]}
                  onSelect={onSelect}
                  onInspect={() => inspect(white.nodeId, `${moveNumber}. ${white.san}`)}
                />
              ) : (
                <span className="move-explorer__gap">…</span>
              )}
              {black && (
                <MoveCell
                  nodeId={black.nodeId}
                  san={black.san}
                  move={qualities[black.nodeId]}
                  isCurrent={currentNodeId === black.nodeId}
                  dimmed={dimmedIds.has(black.nodeId) || nodeExtras?.[black.nodeId]?.dimmed === true}
                  extra={nodeExtras?.[black.nodeId]}
                  onSelect={onSelect}
                  onInspect={() => inspect(black.nodeId, `${moveNumber}... ${black.san}`)}
                />
              )}
            </li>
          );
        })}
      </ol>
      {showNotes && (
        <>
          {currentMove && <OpeningLabel move={currentMove} />}
          <details className="move-explorer__notes" open>
            <summary className="move-explorer__notes-summary">Notes</summary>
            {currentMove ? (
              <>
                <MoveNote move={currentMove} />
                <AlternativesPanel move={currentMove} />
              </>
            ) : (
              <p className="move-explorer__notes-empty">Select a move to see notes.</p>
            )}
          </details>
        </>
      )}
      {inspecting && (
        <MoveAnalysisModal fen={inspecting.fen} moveLabel={inspecting.label} onClose={() => setInspecting(null)} />
      )}
    </div>
  );
}

/** Follows the first move from the node (or the start) to the end of its line. */
function lineEnd(tree: PgnTree, from: PgnTreeNode | undefined): PgnTreeNode | undefined {
  let node = from ?? childrenOf(tree, null)[0];
  for (let next = node && childrenOf(tree, node.id)[0]; next; next = childrenOf(tree, next.id)[0]) node = next;
  return node;
}

interface MoveCellProps {
  nodeId: string;
  san: string;
  move: ClassifiedMoveDto | undefined;
  isCurrent: boolean;
  /** A course episode's lead-in: shown, but not the episode's own moves. */
  dimmed?: boolean;
  extra?: ExplorerNodeExtra;
  onSelect: (nodeId: string) => void;
  /** Opens the move-analysis inspector for this move's position. */
  onInspect: () => void;
}

function MoveCell({ nodeId, san, move, isCurrent, dimmed = false, extra, onSelect, onInspect }: MoveCellProps): ReactNode {
  const quality = move?.quality;
  const className = [quality ? `move-quality-${quality}` : null, dimmed ? 'move-explorer__move--dimmed' : null].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={className || undefined}
      aria-current={isCurrent ? 'true' : undefined}
      title={extra?.comment ?? undefined}
      onClick={() => onSelect(nodeId)}
      onContextMenu={(event) => {
        event.preventDefault();
        onInspect();
      }}
    >
      <MoveQualityBadge quality={quality} size="md" />
      {san}
      {extra?.badges?.map((badge) => (
        <span key={badge} className="move-explorer__badge">
          {badge}
        </span>
      ))}
      {move && <TacticMotifBadge move={move} />}
    </button>
  );
}
