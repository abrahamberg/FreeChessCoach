import type { ReactNode } from 'react';
import { StackedSessionBody } from '../../session/StackedSessionBody.js';
import '../../../styles/board-bottom-bar.css';
import '../../review/GameReviewPage.css';
import '../../session/SessionPage.css';

export interface CourseBoardLayoutProps {
  isDesktop: boolean;
  /** Above the list: the episodes, the clip. Desktop: the explorer column's
   * top; phone: a chip row above the coach. */
  episodes?: ReactNode;
  /** Desktop only: the moves (MoveExplorer, or the drill's log). */
  explorer: ReactNode;
  /** The eval bar and board, and on a desktop what goes under them. */
  board: ReactNode;
  /** The coach: the note, the quiz, the prompt, Ask my coach. */
  coach: ReactNode;
  /** Phone only: under the board (MoveNavStrip). */
  strip?: ReactNode;
  /** Phone only: pinned to the screen's bottom (Previous, the next step). */
  bottomBar?: ReactNode;
}

/** docs/courses.md §11: a course stage on the app's board layouts. Desktop:
 * Game Review's three columns (explorer, board, coach). Phone: the stacked
 * body every board view there shares (StackedSessionBody: the coach card, the
 * board edge to edge, a pinned bottom bar), with the strip under the board. */
export function CourseBoardLayout({ isDesktop, episodes, explorer, board, coach, strip, bottomBar }: CourseBoardLayoutProps): ReactNode {
  if (isDesktop) {
    return (
      <div className="game-review-body desktop course-layout">
        <div className="game-review-explorer-column course-layout__explorer">
          {episodes && <div className="course-layout__episodes">{episodes}</div>}
          {explorer}
        </div>
        <div className="session-board-column">{board}</div>
        <div className="game-review-notes-column course-layout__coach">{coach}</div>
      </div>
    );
  }
  return (
    <StackedSessionBody
      card={coach}
      board={
        <>
          {episodes && <div className="course-layout__episodes course-layout__episodes--row">{episodes}</div>}
          <div className="session-board-column">
            {board}
            {strip}
          </div>
        </>
      }
      footer={bottomBar}
      footerKind="course"
    />
  );
}
