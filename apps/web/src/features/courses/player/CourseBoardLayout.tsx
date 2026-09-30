import type { ReactNode } from 'react';
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

/** docs/courses.md §11: a course stage on the app's board layout, Game
 * Review's (GameReviewPage.tsx) and its classes. Desktop: the explorer
 * column, the board column, the coach column. Phone: the coach on top, the
 * board edge to edge, the strip, and a bottom bar. */
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
    <>
      <div className={bottomBar ? 'game-review-body mobile course-layout has-course-bar' : 'game-review-body mobile course-layout'}>
        {episodes && <div className="course-layout__episodes course-layout__episodes--row">{episodes}</div>}
        <div className="course-layout__coach">{coach}</div>
        <div className="session-board-column">{board}</div>
        {strip}
      </div>
      {bottomBar && <div className="board-bottom-bar course-bottom-bar">{bottomBar}</div>}
    </>
  );
}
