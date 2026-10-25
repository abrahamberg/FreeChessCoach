import { lineTree, sectionFen, type EditableTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument } from '@freechesscoach/shared';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CourseArrow } from '@freechesscoach/shared';
import { ChevronRightIcon, PlaySmallIcon } from '../../../components/Icon.js';
import { CoachBoard } from '../../board/CoachBoard.js';
import { toBoardMarks } from '../courseArrows.js';
import { CourseBoardLayout } from './CourseBoardLayout.js';
import { CoursePane } from './CoursePane.js';
import { LiveReviewView } from '../../live-review/LiveReviewView.js';
import { NoteMention } from './NoteMention.js';
import { noteSegments, readingSentence, sentenceRanges } from './note-marks.js';
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
  // What the page names is drawn only while the reader points at it or the voice reaches it.
  const [pointed, setPointed] = useState<CourseArrow[]>([]);
  /** A line the page writes out, opened on a board the engine reviews; saved nowhere. */
  const [tryOut, setTryOut] = useState<EditableTree | null>(null);
  const parts = useMemo(() => (section ? noteSegments(section.text, [fen]) : []), [section, fen]);
  const text = section?.text ?? '';
  const sentence = audio.voiceSentence !== null ? audio.voiceSentence : audio.progress !== null ? readingSentence(text, audio.progress) : null;
  const range = sentence === null ? null : sentenceRanges(text)[sentence];
  const reads = range ? parts.filter((part) => part.marks && part.start >= range.start && part.start < range.end).flatMap((part) => part.marks!) : [];
  const shown = parts.flatMap((part) => {
    if (!range) return [{ ...part, reading: false }];
    const cuts = [range.start, range.end].filter((cut) => cut > part.start && cut < part.start + part.text.length);
    const edges = [part.start, ...cuts, part.start + part.text.length];
    return edges.slice(0, -1).map((from, index) => ({
      text: part.text.slice(from - part.start, edges[index + 1]! - part.start),
      start: from,
      marks: part.marks,
      line: part.line,
      reading: from >= range.start && from < range.end
    }));
  });
  const marks = toBoardMarks([], pointed.length ? pointed : reads);

  // Each page is read when it opens, from the learner's own click; the first one waits for it.
  useEffect(() => {
    onPage(page);
    if (first.current) first.current = false;
    else if (section) audio.play(READING_EPISODE, section.id);
  }, [page]);

  const go = (next: number): void => {
    audio.stop();
    setPointed([]);
    setPage(next);
  };
  const atEnd = page >= sections.length - 1;

  if (tryOut) {
    return <LiveReviewView base={tryOut} openAt="x1" orientation="white" isDesktop={isDesktop} onBack={() => setTryOut(null)} />;
  }

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
            <CoachBoard fen={fen} orientation="white" mode="peek" disabled arrows={marks.arrows} highlights={marks.highlights} />
          </div>
          {isDesktop && nav}
        </>
      }
      coach={
        <CoursePane persona={document.coachPersona} sound={{ on: audio.soundOn, onChange: audio.setSoundOn }} compact={!isDesktop} title={`Page ${page + 1} of ${sections.length}`}>
          {section && (
            <>
              <p className="course-pane__note">
                {shown.map((part, index) => {
                  const inner = part.marks ? (
                    <NoteMention
                      part={part}
                      onPoint={setPointed}
                      onOpenLine={(line) => {
                        audio.stop();
                        setPointed([]);
                        setTryOut(lineTree(line.fen, line.sans));
                      }}
                    />
                  ) : (
                    part.text
                  );
                  return part.reading ? (
                    <mark key={index} className="course-pane__reading" ref={(element) => element?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })}>
                      {inner}
                    </mark>
                  ) : (
                    <Fragment key={index}>{inner}</Fragment>
                  );
                })}
              </p>
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
