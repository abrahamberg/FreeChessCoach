import { COACH_PERSONA_INFO, type ClassifiedMoveDto, type CourseDocument, type CourseEpisode } from '@freechesscoach/shared';
import { useRef, useState, type ReactNode } from 'react';
import { CoachAvatar } from '../../../components/CoachAvatar.js';
import { CoachCard } from '../../../components/CoachCard.js';
import { CoachBoard } from '../../board/CoachBoard.js';
import { MoveNote } from '../../board/MoveNoteContent.js';
import { MoveQualityBadge } from '../../board/MoveQualityBadge.js';
import { toBoardMarks } from '../courseArrows.js';
import { COURSE_KIND_INFO } from '../courseKinds.js';
import { episodeWalk, isAcceptedAlternative, stepView } from './course-steps.js';
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
}

/** docs/courses.md §9, §11: the clip (when linked), then each episode on the
 * board, move by move with the coach's notes, arrows and voice. A quiz waits
 * for the learner's move; a different move is rated in the browser with no
 * AI. Takes a document, not a slug, so the editor previews the draft. */
export function CoursePlayer({ document, noteAudio, notice }: CoursePlayerProps): ReactNode {
  const [episodeIndex, setEpisodeIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const audio = useNoteAudio(noteAudio);
  const episode = document.episodes[episodeIndex];
  const clip = document.clipLinks.youtube ?? document.clipLinks.shorts;
  const coach = COACH_PERSONA_INFO[document.coachPersona].label;

  const openEpisode = (index: number): void => {
    audio.stop();
    setEpisodeIndex(index);
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
          isLast={episodeIndex === document.episodes.length - 1}
          onDone={() => (episodeIndex < document.episodes.length - 1 ? openEpisode(episodeIndex + 1) : setFinished(true))}
        />
      ) : (
        <p className="meta">This course has no episodes yet.</p>
      )}
      {finished && document.takeaways.some((takeaway) => takeaway.trim()) && (
        <section className="course-player__takeaways" aria-label="Takeaways">
          <h2>Remember</h2>
          <ol>
            {document.takeaways.map((takeaway, index) => (takeaway.trim() ? <li key={index}>{takeaway}</li> : null))}
          </ol>
        </section>
      )}
    </article>
  );
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

type Judgement = { status: 'checking' } | { status: 'ready'; move: ClassifiedMoveDto } | { status: 'error' };

interface Attempt {
  fenBefore: string;
  fenAfter: string;
  san: string;
}

interface EpisodeViewProps {
  document: CourseDocument;
  episode: CourseEpisode;
  audio: ReturnType<typeof useNoteAudio>;
  isLast: boolean;
  onDone: () => void;
}

function EpisodeView({ document, episode, audio, isLast, onDone }: EpisodeViewProps): ReactNode {
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
          {asking && attempt && <AttemptFeedback attempt={attempt} judgement={judgement} answerSan={answer.san} onAccept={() => solve('alternative')} onRetry={tryAgain} />}
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
      </div>
    </div>
  );
}

function solvedLine(how: 'course' | 'alternative' | 'shown' | null, san: string | undefined): string {
  if (how === 'course') return `Yes, ${san}!`;
  if (how === 'alternative') return `The course plays ${san}.`;
  return `The answer is ${san}.`;
}

interface AttemptFeedbackProps {
  attempt: Attempt;
  judgement: Judgement | null;
  answerSan: string;
  onAccept: () => void;
  onRetry: () => void;
}

/** §11: the move-quality label and the checked tactic sentence; a move about
 * as good as the course's is accepted without penalty. */
function AttemptFeedback({ attempt, judgement, answerSan, onAccept, onRetry }: AttemptFeedbackProps): ReactNode {
  if (!judgement || judgement.status === 'checking') return <p className="meta" role="status">Checking {attempt.san}…</p>;
  if (judgement.status === 'error') {
    return (
      <div className="course-player__quiz">
        <p>{attempt.san} is not the course move.</p>
        <div className="course-player__actions">
          <button type="button" className="btn-primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  const { move } = judgement;
  const accepted = isAcceptedAlternative(move.quality);
  return (
    <div className="course-player__quiz">
      <p className="course-player__verdict">
        <MoveQualityBadge quality={move.quality} size="md" /> {attempt.san}: {accepted ? `good move too; the course plays ${answerSan}.` : move.quality}
      </p>
      {!accepted && <MoveNote move={move} />}
      <div className="course-player__actions">
        {accepted ? (
          <button type="button" className="btn-primary" onClick={onAccept}>
            See the course move
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
