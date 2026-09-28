import type { CourseDocument, CourseEnrollmentPlace, CourseEpisode } from '@freechesscoach/shared';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRightIcon, CloseIcon, PlayCircleIcon, PlaySmallIcon } from '../../../components/Icon.js';
import { CoachBoard } from '../../board/CoachBoard.js';
import { EvalBar } from '../../board/EvalBar.js';
import { GameEvalChart } from '../../board/GameEvalChart.js';
import { MoveExplorer } from '../../board/MoveExplorer.js';
import { MoveStrip, moveStripIndexToPly, plyToMoveStripIndex } from '../../board/MoveStrip.js';
import { toBoardMarks } from '../courseArrows.js';
import { AskCoachPanel, AskCoachSignIn } from './AskCoachPanel.js';
import { AttemptFeedback, type Attempt, type Judgement } from './AttemptFeedback.js';
import { CourseBoardLayout } from './CourseBoardLayout.js';
import { CoursePane } from './CoursePane.js';
import { CourseRecap } from './CourseRecap.js';
import { STAGE_LABELS } from './CourseStageBar.js';
import { boardSoundLengthMs, playBoardSound } from '../../../sounds/board-sounds.js';
import { moveSound } from '../../../sounds/move-sounds.js';
import { readMoveSoundsEnabled } from '../../../sounds/move-sounds-setting.js';
import { courseMoveList, courseMoveSound, type CourseEvals } from './course-move-list.js';
import { episodeWalk, isAcceptedAlternative, stepView } from './course-steps.js';
import { judgeQuizMove } from './judge-quiz-move.js';
import type { useNoteAudio } from './useNoteAudio.js';
import { YouTubeClip } from './YouTubeClip.js';

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
  const clip = document.clipLinks.youtube ?? document.clipLinks.shorts;
  const [recap, setRecap] = useState(false);

  const openEpisode = (index: number): void => {
    audio.stop();
    setEpisodeIndex(index);
    onPlace(index, 0);
  };

  const episodes =
    document.episodes.length > 1 || clip ? (
      <nav className="course-player__episodes" aria-label="Episodes">
        {clip && <ClipButton link={clip} title={document.title} vertical={!document.clipLinks.youtube} />}
        {document.episodes.length > 1 &&
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

/** The course's clip in a dialog, so it takes no room beside the board. */
function ClipButton({ link, title, vertical }: { link: string; title: string; vertical: boolean }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="course-chip course-chip--clip" onClick={() => setOpen(true)}>
        <PlayCircleIcon width={15} height={15} />
        Watch the clip
      </button>
      {open && (
        <div className="course-clip-dialog" role="dialog" aria-modal="true" aria-label="The course clip" onClick={() => setOpen(false)}>
          <div className="course-clip-dialog__body" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="course-clip-dialog__close" aria-label="Close the clip" onClick={() => setOpen(false)}>
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

function EpisodeView({ document, evals, episode, episodes, audio, ask, isDesktop, startStep, onStep, nextLabel, onDone }: EpisodeViewProps): ReactNode {
  const walk = useMemo(() => episodeWalk(document, episode), [document, episode]);
  const [step, setStep] = useState(() => Math.min(startStep, walk.moves.length));
  /** The furthest step seen: the move list and graph grow as the learner
   * goes, like a game, so they never show a move (a quiz answer) early. */
  const [reached, setReached] = useState(step);
  const [solved, setSolved] = useState<'course' | 'alternative' | 'shown' | null>(null);
  const [hint, setHint] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [judgement, setJudgement] = useState<Judgement | null>(null);
  const judgeRef = useRef(0);

  const view = stepView(episode, walk, step);
  const quiz = episode.quiz;
  const answer = walk.quizAt === null ? null : walk.moves[walk.quizAt];
  const asking = quiz && answer && step === walk.quizAt && !solved;
  const atEnd = step >= walk.moves.length;
  // The arrows often point at the answer, so none while the quiz asks.
  const marks = toBoardMarks(asking ? [] : view.arrows);

  const list = useMemo(() => courseMoveList(document, walk.moves, evals), [document, walk, evals]);
  const shownPlies = list.leadIn + reached;
  const ply = list.leadIn + step;
  const sanMoves = list.sanMoves.slice(0, shownPlies);
  const positions = list.positions.slice(0, shownPlies + 1);
  const rated = list.classifiedMoves.filter((move) => move.ply <= shownPlies);
  const hasEvals = list.classifiedMoves.length > 0;

  const goTo = (next: number, great = false): void => {
    judgeRef.current += 1;
    setAttempt(null);
    setJudgement(null);
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

  const solve = (how: 'course' | 'alternative' | 'shown'): void => {
    setSolved(how);
    // Found it: great. Otherwise the move's own sounds.
    goTo(step + 1, how === 'course');
  };

  const onQuizMove = (san: string, fenAfter: string, uci: string): void => {
    if (!answer) return;
    if (uci === answer.uci) {
      solve('course');
      return;
    }
    const tried = { fenBefore: view.fen, fenAfter, san };
    const request = ++judgeRef.current;
    setAttempt(tried);
    setJudgement({ status: 'checking' });
    playBoardSound(moveSound({ san, mover: document.learnerSide, learnerSide: document.learnerSide }));
    judgeQuizMove({ ...tried, mover: view.fen.split(' ')[1] === 'b' ? 'black' : 'white' })
      .then((move) => {
        if (request !== judgeRef.current) return;
        setJudgement({ status: 'ready', move });
        playBoardSound(isAcceptedAlternative(move.quality) ? 'great' : 'bad');
      })
      .catch(() => request === judgeRef.current && setJudgement({ status: 'error' }));
  };

  const tryAgain = (): void => {
    judgeRef.current += 1;
    setAttempt(null);
    setJudgement(null);
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

  const board = (
    <>
      <div className="session-board-row">
        {hasEvals && <EvalBar ply={ply} classifiedMoves={rated} orientation={document.learnerSide} />}
        <CoachBoard
          fen={attempt?.fenAfter ?? view.fen}
          orientation={document.learnerSide}
          mode={asking && !attempt ? 'answer' : 'peek'}
          disabled={!asking || attempt !== null}
          arrows={attempt ? [] : marks.arrows}
          highlights={attempt ? [] : marks.highlights}
          onUserMove={onQuizMove}
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
      footer={
        // Not while the quiz asks: the coach knows the course's answer.
        asking ? null : ask === 'sign-in' ? (
          <AskCoachSignIn />
        ) : ask ? (
          <AskCoachPanel position={{ slug: ask.slug, episodeId: episode.id, nodeId: view.move?.id ?? null }} />
        ) : null
      }
    >
      {view.move && <p className="course-player__move">{view.move.san}</p>}
      {revealed && <p className="course-player__reveal">{solvedLine(solved, answer?.san)} {quiz.reveal}</p>}
      {view.note ? (
        <p className="course-pane__note">
          {view.note}
          {view.move && audio.soundOn && (
            <button
              type="button"
              className="coach-voice-button"
              data-state={audio.loading ? 'loading' : 'idle'}
              aria-label="Hear it again"
              title="Hear it again"
              onClick={() => audio.play(episode.id, view.move!.id)}
            >
              {audio.loading ? <span className="coach-voice-button__spinner" aria-hidden="true" /> : <PlaySmallIcon width={11} height={11} />}
            </button>
          )}
        </p>
      ) : (
        !revealed && !asking && <p className="meta">{step === 0 ? 'Press Next to play through the moves.' : 'No note on this move.'}</p>
      )}
      {asking && !attempt && (
        <div className="course-player__quiz">
          <p className="course-player__prompt">{quiz.prompt || 'Your move: what would you play here?'}</p>
          {hint && quiz.hint && <p className="meta">Hint: {quiz.hint}</p>}
          <div className="course-player__actions">
            {quiz.hint && !hint && (
              <button type="button" className="btn-secondary" onClick={() => setHint(true)}>
                Hint
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => solve('shown')}>
              Show the answer
            </button>
          </div>
        </div>
      )}
      {asking && attempt && <AttemptFeedback attempt={attempt} judgement={judgement} answerSan={answer.san} acceptLabel="See the course move" onAccept={() => solve('alternative')} onRetry={tryAgain} />}
      {audio.error && (
        <p className="meta" role="alert">
          {audio.error}
        </p>
      )}
    </CoursePane>
  );

  return (
    <CourseBoardLayout
      isDesktop={isDesktop}
      episodes={episodes}
      explorer={
        <MoveExplorer
          sanMoves={sanMoves}
          classifiedMoves={rated}
          positions={positions}
          currentPly={ply}
          onSelect={selectPly}
          showNotes={false}
          start={list.start}
          dimmedThroughPly={list.leadIn}
        />
      }
      board={board}
      coach={coach}
      strip={
        sanMoves.length > 0 ? (
          <div className="course-layout__strip">
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
          </div>
        ) : undefined
      }
      bottomBar={nav}
    />
  );
}

function solvedLine(how: 'course' | 'alternative' | 'shown' | null, san: string | undefined): string {
  if (how === 'course') return `Yes, ${san}!`;
  if (how === 'alternative') return `The course plays ${san}.`;
  return `The answer is ${san}.`;
}
