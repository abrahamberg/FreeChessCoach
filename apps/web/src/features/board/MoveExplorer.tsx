import { useState, type ReactNode } from 'react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { ChevronLeftIcon, ChevronRightIcon, SkipBackIcon, SkipForwardIcon } from '../../components/Icon.js';
import { MoveAnalysisModal } from './MoveAnalysisModal.js';
import { AlternativesPanel, MoveNote, OpeningLabel } from './MoveNoteContent.js';
import { MoveQualityBadge } from './MoveQualityBadge.js';
import { TacticMotifBadge } from './TacticMotifBadge.js';
import { GAME_START, type MoveListStart } from './moveListStart.js';
import './MoveExplorer.css';

export interface MoveExplorerProps {
  sanMoves: string[];
  classifiedMoves: ClassifiedMoveDto[];
  /** ply-indexed positions (ply 0 = game start) — only `.ply`/`.fen` are
   * read, used to look up the fen for the move analysis inspector modal. */
  positions: { ply: number; fen: string }[];
  currentPly: number;
  onSelect: (ply: number) => void;
  /** The coaching session's desktop layout has nowhere else to show a
   * move's note, so this stays the one place it lives there. The Game
   * Review page's desktop layout has its own dedicated MoveNoteCard column
   * (the same note, shown large) — repeating it here too would just be the
   * same text twice, so that caller passes false. */
  showNotes?: boolean;
  /** Where the moves start (`moveListStart.ts`); a game's 1. by default. */
  start?: MoveListStart;
  /** Plies up to this one are shown faded: a course episode's lead-in. */
  dimmedThroughPly?: number;
}

interface MovePair {
  moveNumber: number;
  /** Absent on the first row when Black moves first ("1... e5"). */
  white?: { ply: number; san: string };
  black?: { ply: number; san: string };
}

function pairMoves(sanMoves: string[], start: MoveListStart): MovePair[] {
  const pairs: MovePair[] = [];
  const offset = start.blackFirst ? 1 : 0;
  for (let half = 0; half < sanMoves.length + offset; half += 2) {
    const whiteIndex = half - offset;
    const whiteSan = whiteIndex >= 0 ? sanMoves[whiteIndex] : undefined;
    const blackSan = sanMoves[whiteIndex + 1];
    if (whiteSan === undefined && blackSan === undefined) continue;
    pairs.push({
      moveNumber: start.moveNumber + half / 2,
      white: whiteSan === undefined ? undefined : { ply: whiteIndex + 1, san: whiteSan },
      black: blackSan === undefined ? undefined : { ply: whiteIndex + 2, san: blackSan }
    });
  }
  return pairs;
}

/** design.md-adjacent move explorer (not yet in design.md — Daniel requested
 * a chess.com/lichess-style panel): paired move list, NAG symbols and
 * quality color-coding from the persisted classification, nav pills, and a
 * plain-language note for the current move. The note lives in a native
 * <details>, open by default — no separate show/hide button, just click the
 * "Notes" summary to collapse it. Sidelines/PGN comments are out of scope
 * here — parsePgn only produces a mainline. */
export function MoveExplorer({
  sanMoves,
  classifiedMoves,
  positions,
  currentPly,
  onSelect,
  showNotes = true,
  start = GAME_START,
  dimmedThroughPly = 0
}: MoveExplorerProps): ReactNode {
  const [inspecting, setInspecting] = useState<{ fen: string; label: string } | null>(null);
  const qualityByPly = new Map(classifiedMoves.map((move) => [move.ply, move]));
  const fenByPly = new Map(positions.map((position) => [position.ply, position.fen]));
  const pairs = pairMoves(sanMoves, start);
  const totalPlies = sanMoves.length;
  const currentMove = qualityByPly.get(currentPly);

  function goTo(ply: number): void {
    onSelect(Math.min(Math.max(ply, 0), totalPlies));
  }

  return (
    <div className="move-explorer">
      <div className="move-explorer__nav">
        <button type="button" aria-label="first move" onClick={() => goTo(0)}>
          <SkipBackIcon width={15} height={15} />
        </button>
        <button type="button" aria-label="previous move" onClick={() => goTo(currentPly - 1)}>
          <ChevronLeftIcon width={16} height={16} />
        </button>
        <span className="move-explorer__position">
          move {currentPly} of {totalPlies}
        </span>
        <button type="button" aria-label="next move" onClick={() => goTo(currentPly + 1)}>
          <ChevronRightIcon width={16} height={16} />
        </button>
        <button type="button" aria-label="last move" onClick={() => goTo(totalPlies)}>
          <SkipForwardIcon width={15} height={15} />
        </button>
      </div>
      <ol className="move-explorer__list">
        {pairs.map((pair) => {
          const { moveNumber, white, black } = pair;
          const whiteFen = white ? fenByPly.get(white.ply) : undefined;
          const blackFen = black ? fenByPly.get(black.ply) : undefined;
          return (
            <li key={moveNumber}>
              <span className="move-explorer__number">{moveNumber}.</span>
              {white ? (
                <MoveCell
                  ply={white.ply}
                  san={white.san}
                  move={qualityByPly.get(white.ply)}
                  isCurrent={currentPly === white.ply}
                  dimmed={white.ply <= dimmedThroughPly}
                  onSelect={onSelect}
                  onInspect={whiteFen ? () => setInspecting({ fen: whiteFen, label: `${moveNumber}. ${white.san}` }) : undefined}
                />
              ) : (
                <span className="move-explorer__gap">…</span>
              )}
              {black && (
                <MoveCell
                  ply={black.ply}
                  san={black.san}
                  move={qualityByPly.get(black.ply)}
                  isCurrent={currentPly === black.ply}
                  dimmed={black.ply <= dimmedThroughPly}
                  onSelect={onSelect}
                  onInspect={blackFen ? () => setInspecting({ fen: blackFen, label: `${moveNumber}... ${black.san}` }) : undefined}
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

interface MoveCellProps {
  ply: number;
  san: string;
  move: ClassifiedMoveDto | undefined;
  isCurrent: boolean;
  /** A course episode's lead-in: shown, but not the episode's own moves. */
  dimmed?: boolean;
  onSelect: (ply: number) => void;
  /** Opens the move-analysis inspector for this move's position; undefined
   * when the fen isn't known yet (shouldn't happen once positions load, but
   * keeps the right-click a no-op instead of throwing). */
  onInspect: (() => void) | undefined;
}

function MoveCell({ ply, san, move, isCurrent, dimmed = false, onSelect, onInspect }: MoveCellProps): ReactNode {
  const quality = move?.quality;
  const className = [quality ? `move-quality-${quality}` : null, dimmed ? 'move-explorer__move--dimmed' : null].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={className || undefined}
      aria-current={isCurrent ? 'true' : undefined}
      onClick={() => onSelect(ply)}
      onContextMenu={(event) => {
        if (!onInspect) return;
        event.preventDefault();
        onInspect();
      }}
    >
      <MoveQualityBadge quality={quality} size="md" />
      {san}
      {move && <TacticMotifBadge move={move} />}
    </button>
  );
}
