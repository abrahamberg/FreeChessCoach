import { lineTree, type EditableTree } from '@freechesscoach/chess-analysis';
import type { CourseArrow, CourseDocument, CourseEnrollmentPlace, CourseEpisode, CourseTempting } from '@freechesscoach/shared';
import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRightIcon, CloseIcon, PauseIcon, PlayCircleIcon, PlaySmallIcon, SkipBackIcon } from '../../../components/Icon.js';
import { CoachBoard } from '../../board/CoachBoard.js';
import { EvalBar } from '../../board/EvalBar.js';
import { GameEvalChart } from '../../board/GameEvalChart.js';
import { LineMoveExplorer } from '../../board/LineMoveExplorer.js';
import { MoveStrip, moveStripIndexToPly, plyToMoveStripIndex } from '../../board/MoveStrip.js';
import { LiveReviewView } from '../../live-review/LiveReviewView.js';
import { toBoardMarks } from '../courseArrows.js';
import { AskCoachPanel, AskCoachSignIn } from './AskCoachPanel.js';
import { BoardFlash, LINE_FLASH_MS } from './BoardFlash.js';
import { QuizAsking } from './QuizAsking.js';
import { CourseBoardLayout } from './CourseBoardLayout.js';
import { CoursePane } from './CoursePane.js';
import { CourseRecap } from './CourseRecap.js';
import { STAGE_LABELS } from './CourseStageBar.js';
import { boardSoundLengthMs, playBoardSound } from '../../../sounds/board-sounds.js';
import { readMoveSoundsEnabled } from '../../../sounds/move-sounds-setting.js';
import { courseMoveList, courseMoveSound, type CourseEvals } from './course-move-list.js';
import { NoteMention } from './NoteMention.js';
import { noteSegments, readingSentence, sentenceRanges, sentenceStart } from './note-marks.js';
import { drillLine } from './drill-line.js';
import { climaxNode } from '../courseEdits.js';
import { episodeWalk, stepView } from './course-steps.js';
import type { useNoteAudio } from './useNoteAudio.js';
import { YouTubeClip } from './YouTubeClip.js';
import { youtubeVideoId } from './youtube.js';

/** §11: signed in, the learner's own coach; signed out, a sign-in box; the
 * editor's preview (no progress store), neither. */
export type AskCoach = { slug: string } | 'sign-in' | null;

interface PlayThroughProps {
  document: CourseDocument;
  evals: CourseEvals;
  audio: ReturnType<typeof useNoteAudio>;
  ask: AskCoach;
  isDesktop: boolean;
  /** Where to open: the saved episode and step. */
  start: CourseEnrollmentPlace;
  onPlace: (episode: number, step: number) => void;
  /** The last episode's end: the play-through is done, on to Practice. */
  onFinished: () => void;
}

/** §11 step 2: each episode move by move on the board layout; at the end,
 * the takeaways on their own screen (the board hidden, kept where it was
 * for "Back to the moves"), then on to Practice. */
export function PlayThrough({ document, evals, audio, ask, isDesktop, start, onPlace, onFinished }: PlayThroughProps): ReactNode {
  const [episodeIndex, setEpisodeIndex] = useState(() => Math.min(start.episode, Math.max(document.episodes.length - 1, 0)));
  const startEpisode = useRef(episodeIndex);
  const episode = document.episodes[episodeIndex];
  const nextEpisode = document.episodes[episodeIndex + 1];
  const takeaways = document.takeaways.filter((takeaway) => takeaway.trim());
  const links = document.clipLinks;
  const reel = links.shorts ?? links.instagram ?? links.tiktok;
  const clips = Boolean(links.youtube || reel);
  const [recap, setRecap] = useState(false);

  const openEpisode = (index: number): void => {
    audio.stop();
    setEpisodeIndex(index);
    onPlace(index, 0);
  };

  // A phone keeps only the clips here: the episodes go by with Next, and the card names the one you are on.
  const chips = isDesktop && document.episodes.length > 1;
  const episodes =
    chips || clips ? (
      <nav className="course-player__episodes" aria-label="Episodes">
        {links.youtube && <ClipButton link={links.youtube} title={document.title} label="Watch the video" vertical={false} />}
        {reel && <ClipButton link={reel} title={document.title} label="Watch the reel" vertical />}
        {chips &&
          document.episodes.map((each, index) => (
            <button
              key={each.id}
              type="button"
              className={index === episodeIndex ? 'course-chip course-chip--selected' : 'course-chip'}
              aria-current={index === episodeIndex ? 'step' : undefined}
              onClick={() => openEpisode(index)}
            >
              {index + 1}. {roleLabel(each.role)}
            </button>
          ))}
      </nav>
    ) : undefined;

  return (
    <>
      {recap && (
        <CourseRecap persona={document.coachPersona} takeaways={takeaways} nextLabel={STAGE_LABELS.practice} onContinue={onFinished} onBack={() => setRecap(false)} />
      )}
      <div className="course-player__stage" hidden={recap}>
        {episode ? (
          <EpisodeView
            key={episode.id}
            document={document}
            evals={evals}
            episode={episode}
            episodes={episodes}
            audio={audio}
            ask={ask}
            isDesktop={isDesktop}
            startStep={episodeIndex === startEpisode.current ? start.step : 0}
            onStep={(step) => onPlace(episodeIndex, step)}
            nextLabel={nextEpisode ? roleLabel(nextEpisode.role) : STAGE_LABELS.practice}
            onDone={() => {
              if (nextEpisode) openEpisode(episodeIndex + 1);
              else if (takeaways.length) {
                audio.stop();
                setRecap(true);
              } else onFinished();
            }}
          />
        ) : (
          <p className="meta course-player__empty">This course has no episodes yet.</p>
        )}
      </div>
    </>
  );
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** The course's YouTube video or reel (§13.1) in a dialog, so it takes no
 * room beside the board; a reel on Instagram or TikTok opens there. */
function ClipButton({ link, title, label, vertical }: { link: string; title: string; label: string; vertical: boolean }): ReactNode {
  const [open, setOpen] = useState(false);
  if (!youtubeVideoId(link)) {
    return (
      <a className="course-chip course-chip--clip" href={link} target="_blank" rel="noopener noreferrer">
        <PlayCircleIcon width={15} height={15} />
        {label}
      </a>
    );
  }
  return (
    <>
      <button type="button" className="course-chip course-chip--clip" onClick={() => setOpen(true)}>
        <PlayCircleIcon width={15} height={15} />
        {label}
      </button>
      {open && (
        <div className="course-clip-dialog" role="dialog" aria-modal="true" aria-label={label} onClick={() => setOpen(false)}>
          <div className="course-clip-dialog__body" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="course-clip-dialog__close" aria-label="Close" onClick={() => setOpen(false)}>
              <CloseIcon width={18} height={18} />
            </button>
            <YouTubeClip link={link} title={title} vertical={vertical} />
          </div>
        </div>
      )}
    </>
  );
}

interface EpisodeViewProps {
  document: CourseDocument;
  evals: CourseEvals;
  episode: CourseEpisode;
  episodes?: ReactNode;
  audio: ReturnType<typeof useNoteAudio>;
  ask: AskCoach;
  isDesktop: boolean;
  startStep: number;
  onStep: (step: number) => void;
  /** What comes after this episode: the next episode's name, or the next stage. */
  nextLabel: string;
  onDone: () => void;
}

/** The sentence being read stays in view when the note is longer than the pane. */
function scrollIntoReach(element: HTMLElement | null): void {
  element?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

function EpisodeView({ document, evals, episode, episodes, audio, ask, isDesktop, startStep, onStep, nextLabel, onDone }: EpisodeViewProps): ReactNode {
  const walk = useMemo(() => episodeWalk(document, episode), [document, episode]);
  // The line this episode belongs to, named over the board as it opens.
  const title = drillLine(document, episode.id)?.title ?? null;
  const before = document.episodes[document.episodes.findIndex((each) => each.id === episode.id) - 1];
  const lineName = document.episodes.length > 1 && title !== (before ? drillLine(document, before.id)?.title : null) ? title : null;
  const [step, setStep] = useState(() => Math.min(startStep, walk.moves.length));
  /** The furthest step seen: the move list and graph grow as the learner
   * goes, like a game, so they never show a move (a quiz answer) early. */
  const [reached, setReached] = useState(step);
  const [solved, setSolved] = useState<'course' | 'shown' | null>(null);
  const [hint, setHint] = useState(false);
  /** A quiz try that is not the course's move, and the course's own word on
   * it when it has one. No engine: the piece is back, the question stands. */
  const [wrong, setWrong] = useState<{ san: string; why: string | null } | null>(null);
  /** The learner moved a piece outside the lesson: their moves from this
   * position, reviewed live by the engine and saved nowhere, until they go
   * back to the lesson. */
  const [tryOut, setTryOut] = useState<EditableTree | null>(null);

  // A hook episode says where the course ends up, so its board is the climax, as the video's hook shows it.
  const climax = episode.role === 'hook' ? climaxNode(document) : undefined;
  const stepped = stepView(episode, walk, step);
  const view = climax ? { ...stepped, fen: climax.fenAfter, arrows: [] } : stepped;
  const tempting = view.note ? (episode.plies.find((each) => each.nodeId === view.move?.id)?.tempting ?? []) : [];
  const quiz = episode.quiz;
  const answer = walk.quizAt === null ? null : walk.moves[walk.quizAt];
  const asking = quiz && answer && step === walk.quizAt && !solved;
  const atEnd = step >= walk.moves.length;
  // The arrows often point at the answer, so none while the quiz asks.
  const list = useMemo(() => courseMoveList(document, walk.moves, evals), [document, walk, evals]);
  // What the note names is drawn only while the reader points at it.
  const [pointed, setPointed] = useState<CourseArrow[]>([]);
  const noteParts = useMemo(() => (view.note ? noteSegments(view.note, list.positions.slice(0, -1).map((each) => each.fen)) : []), [view.note, list.positions]);
  // The sentence being read is marked, and what it names is drawn on the board with it.
  const reading = !view.note ? null : audio.voiceSentence !== null ? audio.voiceSentence : audio.progress !== null ? readingSentence(view.note, audio.progress) : null;
  const readRange = reading === null || !view.note ? null : sentenceRanges(view.note)[reading];
  const reads = readRange ? noteParts.filter((part) => part.marks && part.start >= readRange.start && part.start < readRange.end).flatMap((part) => part.marks!) : [];
  // The note in pieces, the sentence being read set apart (a piece never crosses its edge).
  const shown = noteParts.flatMap((part) => {
    if (!readRange) return [{ ...part, reading: false }];
    const cuts = [readRange.start, readRange.end].filter((cut) => cut > part.start && cut < part.start + part.text.length);
    const edges = [part.start, ...cuts, part.start + part.text.length];
    return edges.slice(0, -1).map((from, index) => ({
      text: part.text.slice(from - part.start, edges[index + 1]! - part.start),
      start: from,
      marks: part.marks,
      line: part.line,
      alternative: part.alternative,
      reading: from >= readRange.start && from < readRange.end
    }));
  });
  const marks = toBoardMarks(asking ? [] : view.arrows, asking ? [] : pointed.length ? pointed : reads);
  // The move on the board, as the course's film shows it: its squares lit
  // and the engine's badge on the square it landed on.
  const played = climax ?? view.move;
  const lastMove = played ? [played.uci.slice(0, 2), played.uci.slice(2, 4)].map((square) => ({ square, color: 'var(--last-move)' })) : [];
  const playedQuality = played ? evals[played.id]?.quality : undefined;

  const shownPlies = list.leadIn + reached;
  const ply = list.leadIn + step;
  const sanMoves = list.sanMoves.slice(0, shownPlies);
  const positions = list.positions.slice(0, shownPlies + 1);
  const rated = list.classifiedMoves.filter((move) => move.ply <= shownPlies);
  const hasEvals = list.classifiedMoves.length > 0;
  // Always there: the board's own figure, else the last one the engine gave on the way here (even at 0 before any).
  const barCp = climax
    ? evals[climax.id]?.cp
    : [...list.classifiedMoves].reverse().find((move) => move.ply <= ply)?.evalAfterCp;

  const goTo = (next: number, great = false): void => {
    setWrong(null);
    setPointed([]);
    setStep(next);
    setReached((prev) => Math.max(prev, next));
    onStep(next);
    const move = walk.moves[next - 1];
    // One step on sounds the move; its note waits until the sound ends.
    let wait = 0;
    if (move && next === step + 1) {
      const sound = courseMoveSound(document, evals, move, great);
      playBoardSound(sound);
      if (readMoveSoundsEnabled()) wait = boardSoundLengthMs(sound);
    }
    if (next > step && move && episode.plies.some((ply) => ply.nodeId === move.id && ply.course && ply.text.trim())) audio.play(episode.id, move.id, wait);
    else audio.stop();
  };
  // A lead-in move (before the episode starts) opens the episode's start.
  const selectPly = (selected: number): void => goTo(Math.min(Math.max(selected - list.leadIn, 0), reached));

  const solve = (how: 'course' | 'shown'): void => {
    setSolved(how);
    // Found it: great. Otherwise the move's own sounds.
    goTo(step + 1, how === 'course');
  };

  const onQuizMove = (san: string, _fenAfter: string, uci: string): void => {
    if (!answer) return;
    if (uci === answer.uci) {
      solve('course');
      return;
    }
    // Any other move, a good one too, is simply not the lesson's: said
    // softly, with what the course says about it when it is one of the
    // tempting moves here.
    const plain = (move: string): string => move.replace(/[+#?!]+$/, '');
    const known = episode.plies.find((ply) => ply.nodeId === answer.id)?.tempting?.find((each) => plain(each.san) === plain(san));
    setWrong({ san, why: known?.why.trim() || null });
  };

  const revealed = quiz && solved && walk.quizAt !== null && step === walk.quizAt + 1;

  const nav = (
    <div className="course-player__nav">
      <button type="button" className="btn-secondary" disabled={step === 0} onClick={() => goTo(step - 1)}>
        Previous
      </button>
      <span className="meta">{step === 0 ? 'Start' : `Move ${step} of ${walk.moves.length}`}</span>
      {atEnd ? (
        <button type="button" className="btn-primary course-player__next" aria-label={`Next: ${nextLabel}`} onClick={onDone}>
          {nextLabel}
          <ChevronRightIcon width={16} height={16} />
        </button>
      ) : (
        <button type="button" className="btn-primary" disabled={Boolean(asking)} onClick={() => goTo(step + 1)}>
          Next
        </button>
      )}
    </div>
  );

  const controls =
    view.move && audio.soundOn ? (
            <div className="course-pane__reader">
              <button
                type="button"
                className="coach-voice-button"
                aria-label="Read the previous section again"
                title="Read the previous section again"
                disabled={reading === null}
                onClick={() => {
                  const previous = Math.max((reading ?? 0) - 1, 0);
                  if (audio.voiceSentence !== null) audio.readFrom(previous);
                  else audio.seek(sentenceStart(view.note!, previous));
                }}
              >
                <SkipBackIcon width={11} height={11} />
              </button>
              <button
                type="button"
                className="coach-voice-button"
                data-state={audio.loading ? 'loading' : 'idle'}
                aria-label={reading === null ? 'Hear it again' : audio.paused ? 'Resume reading' : 'Pause reading'}
                title={reading === null ? 'Hear it again' : audio.paused ? 'Resume reading' : 'Pause reading'}
                onClick={() => (reading === null ? audio.play(episode.id, view.move!.id) : audio.togglePause())}
              >
                {audio.loading ? (
                  <span className="coach-voice-button__spinner" aria-hidden="true" />
                ) : reading === null || audio.paused ? (
                  <PlaySmallIcon width={11} height={11} />
                ) : (
                  <PauseIcon width={11} height={11} />
                )}
              </button>
            </div>
    ) : null;

  const board = (
    <>
      <div className="session-board-row course-board-host">
        {startStep === 0 && lineName && <BoardFlash content={{ kind: 'line', title: lineName }} ms={LINE_FLASH_MS} />}
        <EvalBar ply={ply} classifiedMoves={rated} orientation={document.learnerSide} cpOverride={barCp} />
        <CoachBoard
          fen={view.fen}
          orientation={document.learnerSide}
          mode={asking ? 'answer' : 'peek'}
          showLegalMoveDots
          arrows={marks.arrows}
          highlights={[...lastMove, ...marks.highlights]}
          moveQualityBadge={played && playedQuality ? { square: played.uci.slice(2, 4), quality: playedQuality } : undefined}
          mateEffect
          onUserMove={onQuizMove}
          onLocalMove={(_fen, move) => {
            if (asking) return;
            audio.stop();
            setTryOut(lineTree(move.fenBefore, [move.san]));
          }}
        />
      </div>
      {isDesktop && nav}
      {isDesktop && hasEvals && rated.length > 0 && <GameEvalChart classifiedMoves={rated} currentPly={ply} onSelect={selectPly} />}
    </>
  );

  const coach = (
    <CoursePane
      persona={document.coachPersona}
      sound={{ on: audio.soundOn, onChange: audio.setSoundOn }}
      footerInHeader={!isDesktop}
      compact={!isDesktop}
      title={[roleLabel(episode.role), view.move && !climax ? view.move.san : null].filter(Boolean).join(' · ')}
      footer={
        // Not while the quiz asks: the coach knows the course's answer.
        asking ? null : ask === 'sign-in' ? (
          <AskCoachSignIn />
        ) : ask ? (
          <AskCoachPanel position={{ slug: ask.slug, episodeId: episode.id, nodeId: view.move?.id ?? null }} />
        ) : null
      }
    >
      {view.move && !climax && isDesktop && <p className="course-player__move">{view.move.san}</p>}
      {revealed && <p className="course-player__reveal">{solvedLine(solved, answer?.san)} {quiz.reveal}</p>}
      {view.note ? (
        <>
        {controls && reading === null && controls}
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
            const first = part.reading && !shown[index - 1]?.reading;
            // A zero-size anchor just before the sentence carries the buttons above it, out of the text's flow.
            const anchor = first ? <span className="course-pane__anchor">{controls}</span> : null;
            return part.reading ? <Fragment key={index}>{anchor}<mark className="course-pane__reading" ref={scrollIntoReach}>{inner}</mark></Fragment> : <Fragment key={index}>{inner}</Fragment>;
          })}
        </p>
        </>
      ) : (
        !revealed && !asking && <p className="meta">{step === 0 ? 'Press Next to play through the moves.' : 'No note on this move.'}</p>
      )}
      {tempting.length > 0 && !asking && <TemptingMoves tempting={tempting} />}
      {!asking && <p className="meta">Move a piece to try your own idea: the engine reviews it, and nothing is saved.</p>}
      {asking && (
        <QuizAsking
          quiz={quiz}
          hintShown={hint}
          onHint={() => setHint(true)}
          onShow={() => solve('shown')}
          wrong={wrong}
        />
      )}
      {audio.error && (
        <p className="meta" role="alert">
          {audio.error}
        </p>
      )}
    </CoursePane>
  );

  if (tryOut) {
    return (
      <LiveReviewView base={tryOut} openAt="x1" orientation={document.learnerSide} isDesktop={isDesktop} onBack={() => setTryOut(null)} />
    );
  }

  return (
    <CourseBoardLayout
      isDesktop={isDesktop}
      episodes={episodes}
      explorer={
        <LineMoveExplorer
          sanMoves={sanMoves}
          classifiedMoves={rated}
          positions={positions}
          currentPly={ply}
          onSelect={selectPly}
          showNotes={false}
          dimmedThroughPly={list.leadIn}
          hideNav
        />
      }
      board={board}
      coach={coach}
      strip={
        <div className="course-layout__strip">
          {sanMoves.length > 0 && (
            <MoveStrip
              sanMoves={sanMoves}
              classifiedMoves={rated}
              positions={positions}
              currentPly={plyToMoveStripIndex(ply)}
              momentPlies={[]}
              onSelect={(index) => selectPly(moveStripIndexToPly(index))}
              start={list.start}
              dimmedThroughPly={list.leadIn}
            />
          )}
        </div>
      }
      bottomBar={nav}
    />
  );
}

/** §13.5: the moves that looked right here and fail, folded under the note. */
function TemptingMoves({ tempting }: { tempting: CourseTempting[] }): ReactNode {
  return (
    <details className="course-player__tempting">
      <summary>Tempting: {tempting.map((each) => `${each.san}?`).join(', ')}</summary>
      <ul>
        {tempting.map((each) => (
          <li key={each.san}>
            <strong>
              {each.san}?{each.refutation?.length ? ` ${each.refutation.join(' ')}` : ''}
            </strong>{' '}
            {each.why}
          </li>
        ))}
      </ul>
    </details>
  );
}

function solvedLine(how: 'course' | 'shown' | null, san: string | undefined): string {
  if (how === 'course') return `Yes, ${san}!`;
  return `The answer is ${san}.`;
}
