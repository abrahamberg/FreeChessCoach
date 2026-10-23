import { sectionFen } from '@freechesscoach/chess-analysis';
import type { CourseDocument } from '@freechesscoach/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRightIcon, PlaySmallIcon } from '../../../components/Icon.js';
import { CoachBoard } from '../../board/CoachBoard.js';
import { CourseBoardLayout } from './CourseBoardLayout.js';
import { CoursePane } from './CoursePane.js';
import type { useNoteAudio } from './useNoteAudio.js';

/** The `episodeId` a reading page's note is voiced under (its node is the page's id). */
export const READING_EPISODE = 'reading';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface ReadingViewProps {
  document: CourseDocument;
  audio: ReturnType<typeof useNoteAudio>;
  isDesktop: boolean;
  /** The page to open at (a saved place). */
  start: number;
  onPage: (page: number) => void;
  onFinished: () => void;
}

/** docs/courses.md §3, `reading`: the pages one by one, each read aloud, on
 * the board of the nearest diagram. Next on the last page finishes the course. */
export function ReadingView({ document, audio, isDesktop, start, onPage, onFinished }: ReadingViewProps): ReactNode {
  const sections = document.sections ?? [];
  const [page, setPage] = useState(() => Math.min(start, Math.max(sections.length - 1, 0)));
  const section = sections[page];
  const fen = sectionFen(sections, page) ?? START_FEN;
  const first = useRef(true);

  // Each page is read when it opens, from the learner's own click; the first one waits for it.
  useEffect(() => {
    onPage(page);
    if (first.current) first.current = false;
    else if (section) audio.play(READING_EPISODE, section.id);
  }, [page]);

  const go = (next: number): void => {
    audio.stop();
    setPage(next);
  };
  const atEnd = page >= sections.length - 1;

  const nav = (
    <div className="course-player__nav">
      <button type="button" className="btn-secondary" disabled={page === 0} onClick={() => go(page - 1)}>
        Previous
      </button>
      <span className="meta">{`Page ${page + 1} of ${sections.length}`}</span>
      {atEnd ? (
        <button type="button" className="btn-primary course-player__next" onClick={onFinished}>
          Done
          <ChevronRightIcon width={16} height={16} />
        </button>
      ) : (
        <button type="button" className="btn-primary" onClick={() => go(page + 1)}>
          Next
        </button>
      )}
    </div>
  );

  return (
    <CourseBoardLayout
      isDesktop={isDesktop}
      explorer={
        <ol className="reading-pages">
          {sections.map((each, index) => (
            <li key={each.id}>
              <button type="button" className={index === page ? 'reading-pages__page reading-pages__page--current' : 'reading-pages__page'} onClick={() => go(index)}>
                {`Page ${index + 1}`}
              </button>
            </li>
          ))}
        </ol>
      }
      board={
        <>
          <div className="session-board-row course-board-host">
            <CoachBoard fen={fen} orientation="white" mode="peek" disabled />
          </div>
          {isDesktop && nav}
        </>
      }
      coach={
        <CoursePane persona={document.coachPersona} sound={{ on: audio.soundOn, onChange: audio.setSoundOn }} compact={!isDesktop} title={`Page ${page + 1} of ${sections.length}`}>
          {section && (
            <>
              <p className="course-pane__note">{section.text}</p>
              {audio.soundOn && (
                <button type="button" className="coach-voice-button" aria-label="Hear it again" title="Hear it again" onClick={() => audio.play(READING_EPISODE, section.id)}>
                  <PlaySmallIcon width={11} height={11} />
                </button>
              )}
            </>
          )}
        </CoursePane>
      }
      bottomBar={nav}
    />
  );
}
