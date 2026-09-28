import { nextCourseStage, type CourseStage } from '@freechesscoach/chess-analysis';
import { COACH_PERSONA_INFO, type CourseDocument, type CourseEnrollmentPlace, type CourseEpisode } from '@freechesscoach/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRightIcon, PlaySmallIcon, UndoIcon } from '../../../components/Icon.js';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog.js';
import { CoachBoard } from '../../board/CoachBoard.js';
import { toBoardMarks } from '../courseArrows.js';
import { COURSE_KIND_INFO } from '../courseKinds.js';
import { AskCoachPanel, AskCoachSignIn } from './AskCoachPanel.js';
import { AttemptFeedback, type Attempt, type Judgement } from './AttemptFeedback.js';
import { CourseDrill } from './CourseDrill.js';
import { CoursePane } from './CoursePane.js';
import { CourseRecap } from './CourseRecap.js';
import { CourseStageBar, STAGE_LABELS } from './CourseStageBar.js';
import type { CourseProgressStore } from './course-progress.js';
import { episodeWalk, stepView } from './course-steps.js';
import { judgeQuizMove } from './judge-quiz-move.js';
import { useCourseEnrollment } from './useCourseEnrollment.js';
import { useNoteAudio, type NoteAudioSource } from './useNoteAudio.js';
import { YouTubeClip } from './YouTubeClip.js';
import '../CourseEditor.css';
import './CoursePlayer.css';

export interface CoursePlayerProps {
  /** The published copy on /learn, or the editor's draft in the preview. */
  document: CourseDocument;
  noteAudio: NoteAudioSource;
  /** Above the course, e.g. the editor's "this is a preview" line. */
  notice?: ReactNode;
  /** Where drill results go (§11); absent in the preview, which saves nothing. */
  progress?: CourseProgressStore | null;
  courseSlug?: string;
  /** The stage to open at (`?stage=`); the Due today link opens the drill.
   * Without it, a learner coming back opens where they left off. */
  startStage?: CourseStage;
}

const START: CourseEnrollmentPlace = { episode: 0, step: 0, practice: {} };

/** docs/courses.md §9, §11: play through (the clip when linked, then each
 * episode on the board, move by move with the coach's notes, arrows and
 * voice) or drill the moves. A quiz waits for the learner's move; a
 * different move is rated in the browser with no AI. Takes a document, not a
 * slug, so the editor previews the draft. */
export function CoursePlayer({ document, noteAudio, notice, progress, courseSlug, startStage }: CoursePlayerProps): ReactNode {
  const [stage, setStage] = useState<CourseStage>(startStage ?? 'play_through');
  const [done, setDone] = useState<ReadonlySet<CourseStage>>(new Set());
  const [place, setPlace] = useState<CourseEnrollmentPlace>(START);
  /** Remounts the stage's view when a saved place or "Start over" replaces it. */
  const [viewKey, setViewKey] = useState(0);
  const audio = useNoteAudio(noteAudio);
  const { confirm, dialog } = useConfirmDialog();
  const coach = COACH_PERSONA_INFO[document.coachPersona].label;
  const enrollment = useCourseEnrollment(courseSlug, progress);
  /** The learner has done something here, so there is a place worth saving. */
  const touchedRef = useRef(false);
  const appliedRef = useRef(false);

  // §11: coming back picks up where they left off (a stage asked for in the
  // link still opens, with what they finished before).
  useEffect(() => {
    if (appliedRef.current || enrollment.saved === undefined) return;
    appliedRef.current = true;
    const saved = enrollment.saved;
    if (!saved || touchedRef.current) return;
    setDone(new Set(saved.stagesDone));
    setPlace(saved.place);
    if (!startStage) setStage(saved.stage);
    setViewKey((key) => key + 1);
  }, [enrollment.saved, startStage]);

  useEffect(() => {
    if (touchedRef.current) enrollment.save({ stage, place, stagesDone: [...done] });
  }, [stage, done, place]);

  const touch = (): void => {
    touchedRef.current = true;
  };
  const open = (next: CourseStage): void => {
    touch();
    audio.stop();
    setStage(next);
  };
  const finish = (finished: CourseStage): void => {
    touch();
    setDone((prev) => new Set(prev).add(finished));
  };
  const openNext = (): void => {
    const next = nextCourseStage(stage);
    if (next) open(next);
  };
  const startOver = (): void => {
    touch();
    audio.stop();
    setStage('play_through');
    setDone(new Set());
    setPlace(START);
    setViewKey((key) => key + 1);
  };

  return (
    <article className="course-player">
      {notice}
      <header className="course-player__header">
        <p className="course-player__kicker">
          {COURSE_KIND_INFO[document.kind].label} · with {coach}
        </p>
        <h1>{document.title || 'Untitled course'}</h1>
        {document.promise && <p className="course-player__promise">{document.promise}</p>}
      </header>
      <div className="course-player__stage-row">
        <CourseStageBar current={stage} done={done} onSelect={open} />
        {/* Only for a learner (the editor's preview has no progress), once there is something to lose. */}
        {progress && (done.size > 0 || stage !== 'play_through' || place.episode > 0 || place.step > 0) && (
          <button
            type="button"
            className="course-player__start-over"
            onClick={() =>
              confirm(
                { title: 'Start this course over?', description: 'You go back to the first move of Play through, with no stages done. Moves you drilled stay in your reviews.', confirmLabel: 'Start over' },
                startOver
              )
            }
          >
            <UndoIcon width={15} height={15} />
            Start over
          </button>
        )}
      </div>
      {dialog}
      {stage === 'play_through' ? (
        <PlayThrough
          key={viewKey}
          document={document}
          audio={audio}
          ask={askFor(progress, courseSlug)}
          start={place}
          onPlace={(episode, step) => {
            touch();
            setPlace((prev) => (prev.episode === episode && prev.step === step ? prev : { ...prev, episode, step }));
          }}
          onFinished={() => {
            finish('play_through');
            openNext();
          }}
        />
      ) : (
        <CourseDrill
          key={`${stage}:${viewKey}`}
          document={document}
          stage={stage}
          progress={progress}
          courseSlug={courseSlug}
          knownMoves={place.practice}
          onKnownMoves={(practice) => {
            touch();
            setPlace((prev) => ({ ...prev, practice }));
          }}
          onStageDone={finish}
          onNextStage={openNext}
          onExit={() => open('play_through')}
        />
      )}
    </article>
  );
}

/** §11: signed in, the learner's own coach; signed out, a sign-in box; the
 * editor's preview (no progress store), neither. */
type AskCoach = { slug: string } | 'sign-in' | null;

function askFor(progress: CourseProgressStore | null | undefined, slug: string | undefined): AskCoach {
  if (!progress || !slug) return null;
  return progress.signedIn ? { slug } : 'sign-in';
}

interface PlayThroughProps {
  document: CourseDocument;
  audio: ReturnType<typeof useNoteAudio>;
  ask: AskCoach;
  /** Where to open: the saved episode and step. */
  start: CourseEnrollmentPlace;
  onPlace: (episode: number, step: number) => void;
  /** The last episode's end: the play-through is done, on to Practice. */
  onFinished: () => void;
}

/** §11 step 2: the clip, then each episode move by move; at the end, the
 * takeaways on their own screen (the board hidden, kept where it was for
 * "Back to the moves"), then on to Practice. */
function PlayThrough({ document, audio, ask, start, onPlace, onFinished }: PlayThroughProps): ReactNode {
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

  return (
    <>
      {recap && (
        <CourseRecap persona={document.coachPersona} takeaways={takeaways} nextLabel={STAGE_LABELS.practice} onContinue={onFinished} onBack={() => setRecap(false)} />
      )}
      <div className="course-player__play-through" hidden={recap}>
        {clip && <YouTubeClip link={clip} title={document.title} vertical={!document.clipLinks.youtube} />}
        {document.episodes.length > 1 && (
          <nav className="course-player__episodes" aria-label="Episodes">
            {document.episodes.map((each, index) => (
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
        )}
        {episode ? (
          <EpisodeView
            key={episode.id}
            document={document}
            episode={episode}
            audio={audio}
            ask={ask}
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
          <p className="meta">This course has no episodes yet.</p>
        )}
      </div>
    </>
  );
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

interface EpisodeViewProps {
  document: CourseDocument;
  episode: CourseEpisode;
  audio: ReturnType<typeof useNoteAudio>;
  ask: AskCoach;
  startStep: number;
  onStep: (step: number) => void;
  /** What comes after this episode: the next episode's name, or the next stage. */
  nextLabel: string;
  onDone: () => void;
}

function EpisodeView({ document, episode, audio, ask, startStep, onStep, nextLabel, onDone }: EpisodeViewProps): ReactNode {
  const walk = episodeWalk(document, episode);
  const [step, setStep] = useState(() => Math.min(startStep, walk.moves.length));
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

  const goTo = (next: number): void => {
    judgeRef.current += 1;
    setAttempt(null);
    setJudgement(null);
    setStep(next);
    onStep(next);
    const move = walk.moves[next - 1];
    if (next > step && move && episode.notes.some((note) => note.nodeId === move.id && note.text.trim())) audio.play(episode.id, move.id);
    else audio.stop();
  };

  const solve = (how: 'course' | 'alternative' | 'shown'): void => {
    setSolved(how);
    goTo(step + 1);
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
    judgeQuizMove({ ...tried, mover: view.fen.split(' ')[1] === 'b' ? 'black' : 'white' })
      .then((move) => request === judgeRef.current && setJudgement({ status: 'ready', move }))
      .catch(() => request === judgeRef.current && setJudgement({ status: 'error' }));
  };

  const tryAgain = (): void => {
    judgeRef.current += 1;
    setAttempt(null);
    setJudgement(null);
  };

  const revealed = quiz && solved && walk.quizAt !== null && step === walk.quizAt + 1;

  return (
    <div className="course-player__episode">
      <div className="course-player__board">
        <CoachBoard
          fen={attempt?.fenAfter ?? view.fen}
          orientation={document.learnerSide}
          mode={asking && !attempt ? 'answer' : 'peek'}
          disabled={!asking || attempt !== null}
          arrows={attempt ? [] : marks.arrows}
          highlights={attempt ? [] : marks.highlights}
          onUserMove={onQuizMove}
        />
        <div className="course-player__nav">
          <button type="button" className="btn-secondary" disabled={step === 0} onClick={() => goTo(step - 1)}>
            Previous
          </button>
          <span className="meta">
            {step === 0 ? 'Start' : `Move ${step} of ${walk.moves.length}`}
          </span>
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
      </div>

      <div className="course-player__words">
        <CoursePane
          persona={document.coachPersona}
          soundOn={audio.soundOn}
          onSoundOn={audio.setSoundOn}
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
      </div>
    </div>
  );
}

function solvedLine(how: 'course' | 'alternative' | 'shown' | null, san: string | undefined): string {
  if (how === 'course') return `Yes, ${san}!`;
  if (how === 'alternative') return `The course plays ${san}.`;
  return `The answer is ${san}.`;
}
