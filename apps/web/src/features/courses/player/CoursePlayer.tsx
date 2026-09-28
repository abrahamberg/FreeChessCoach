import { COACH_PERSONA_INFO, type CourseDocument, type CourseEpisode } from '@freechesscoach/shared';
import { useRef, useState, type ReactNode } from 'react';
import { CoachAvatar } from '../../../components/CoachAvatar.js';
import { CoachCard } from '../../../components/CoachCard.js';
import { CoachBoard } from '../../board/CoachBoard.js';
import { toBoardMarks } from '../courseArrows.js';
import { COURSE_KIND_INFO } from '../courseKinds.js';
import { AskCoachPanel, AskCoachSignIn } from './AskCoachPanel.js';
import { AttemptFeedback, type Attempt, type Judgement } from './AttemptFeedback.js';
import { CourseDrill } from './CourseDrill.js';
import type { CourseProgressStore } from './course-progress.js';
import { episodeWalk, stepView } from './course-steps.js';
import { judgeQuizMove } from './judge-quiz-move.js';
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
  /** The Games page's "Due today" link opens the drill straight away. */
  startWithDrill?: boolean;
}

/** docs/courses.md §9, §11: play through (the clip when linked, then each
 * episode on the board, move by move with the coach's notes, arrows and
 * voice) or drill the moves. A quiz waits for the learner's move; a
 * different move is rated in the browser with no AI. Takes a document, not a
 * slug, so the editor previews the draft. */
export function CoursePlayer({ document, noteAudio, notice, progress, courseSlug, startWithDrill = false }: CoursePlayerProps): ReactNode {
  const [drilling, setDrilling] = useState(startWithDrill);
  const audio = useNoteAudio(noteAudio);
  const coach = COACH_PERSONA_INFO[document.coachPersona].label;

  const drill = (on: boolean): void => {
    audio.stop();
    setDrilling(on);
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
      <nav className="course-player__modes" aria-label="Mode">
        <button type="button" className={drilling ? 'course-chip' : 'course-chip course-chip--selected'} aria-pressed={!drilling} onClick={() => drill(false)}>
          Play through
        </button>
        <button type="button" className={drilling ? 'course-chip course-chip--selected' : 'course-chip'} aria-pressed={drilling} onClick={() => drill(true)}>
          Drill
        </button>
      </nav>
      {drilling ? (
        <CourseDrill document={document} progress={progress} courseSlug={courseSlug} onExit={() => drill(false)} />
      ) : (
        <PlayThrough document={document} audio={audio} ask={askFor(progress, courseSlug)} onDrill={() => drill(true)} />
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
  onDrill: () => void;
}

/** §11 step 2: the clip, then each episode move by move; the takeaways and
 * the way to the drill at the end. */
function PlayThrough({ document, audio, ask, onDrill }: PlayThroughProps): ReactNode {
  const [episodeIndex, setEpisodeIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const episode = document.episodes[episodeIndex];
  const clip = document.clipLinks.youtube ?? document.clipLinks.shorts;

  const openEpisode = (index: number): void => {
    audio.stop();
    setEpisodeIndex(index);
  };

  return (
    <>
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
          isLast={episodeIndex === document.episodes.length - 1}
          onDone={() => (episodeIndex < document.episodes.length - 1 ? openEpisode(episodeIndex + 1) : setFinished(true))}
        />
      ) : (
        <p className="meta">This course has no episodes yet.</p>
      )}
      {finished && (
        <section className="course-player__takeaways" aria-label="Takeaways">
          {document.takeaways.some((takeaway) => takeaway.trim()) && (
            <>
              <h2>Remember</h2>
              <ol>
                {document.takeaways.map((takeaway, index) => (takeaway.trim() ? <li key={index}>{takeaway}</li> : null))}
              </ol>
            </>
          )}
          <p>Now play the moves yourself.</p>
          <button type="button" className="btn-primary" onClick={onDrill}>
            Drill it
          </button>
        </section>
      )}
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
  isLast: boolean;
  onDone: () => void;
}

function EpisodeView({ document, episode, audio, ask, isLast, onDone }: EpisodeViewProps): ReactNode {
  const walk = episodeWalk(document, episode);
  const [step, setStep] = useState(0);
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
            <button type="button" className="btn-primary" onClick={onDone}>
              {isLast ? 'Finish' : 'Next episode'}
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={Boolean(asking)} onClick={() => goTo(step + 1)}>
              Next
            </button>
          )}
        </div>
      </div>

      <div className="course-player__words">
        <CoachCard avatar={<CoachAvatar persona={document.coachPersona} size="chat" />}>
          {view.move && <p className="course-player__move">{view.move.san}</p>}
          {revealed && <p className="course-player__reveal">{solvedLine(solved, answer?.san)} {quiz.reveal}</p>}
          {view.note ? <p>{view.note}</p> : !revealed && !asking && <p className="meta">{step === 0 ? 'Press Next to play through the moves.' : 'No note on this move.'}</p>}
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
        </CoachCard>
        <div className="course-player__sound">
          <button type="button" className="btn-secondary" aria-pressed={audio.soundOn} onClick={() => audio.setSoundOn(!audio.soundOn)}>
            {audio.soundOn ? 'Sound on' : 'Sound off'}
          </button>
          {view.note && view.move && audio.soundOn && (
            <button type="button" className="btn-secondary" onClick={() => audio.play(episode.id, view.move!.id)}>
              Hear it again
            </button>
          )}
          {audio.loading && <span className="meta">Loading the voice…</span>}
          {audio.error && (
            <span className="meta" role="alert">
              {audio.error}
            </span>
          )}
        </div>
        {/* Not while the quiz asks: the coach knows the course's answer. */}
        {!asking && ask === 'sign-in' && <AskCoachSignIn />}
        {!asking && ask && ask !== 'sign-in' && <AskCoachPanel position={{ slug: ask.slug, episodeId: episode.id, nodeId: view.move?.id ?? null }} />}
      </div>
    </div>
  );
}

function solvedLine(how: 'course' | 'alternative' | 'shown' | null, san: string | undefined): string {
  if (how === 'course') return `Yes, ${san}!`;
  if (how === 'alternative') return `The course plays ${san}.`;
  return `The answer is ${san}.`;
}
