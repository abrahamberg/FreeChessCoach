import { buildCourseDrill, type CourseDrill as Drill, type CourseReviewState } from '@freechesscoach/chess-analysis';
import type { CourseDocument } from '@freechesscoach/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CoachAvatar } from '../../../components/CoachAvatar.js';
import { CoachCard } from '../../../components/CoachCard.js';
import { CoachBoard } from '../../board/CoachBoard.js';
import { AttemptFeedback, type Attempt, type Judgement } from './AttemptFeedback.js';
import { localToday, type CourseProgressStore } from './course-progress.js';
import { isAcceptedAlternative } from './course-steps.js';
import { judgeQuizMove } from './judge-quiz-move.js';

export interface CourseDrillProps {
  document: CourseDocument;
  /** Where results go; absent in the editor's preview, which saves nothing. */
  progress?: CourseProgressStore | null;
  courseSlug?: string;
  onExit: () => void;
}

/** Pause before a move the learner does not play is made for them. */
const AUTO_MOVE_MS = 600;

const MODE_INTRO: Record<Drill['mode'], string> = {
  learner_side: 'Play your side; the other side’s moves are played for you.',
  both_sides: 'Play both sides: spring the trap, and see it coming.',
  find_move: 'Find the move in each position.',
  guess_move: 'Guess each move of the game; your score is kept.'
};

/**
 * docs/courses.md §11 step 3: the learner plays the course's moves. The
 * first try at each asked move counts for the review schedule; a different
 * move is rated in the browser like the quiz (a move about as good is
 * accepted, no penalty). Results are sent as they happen.
 */
export function CourseDrill({ document, progress, courseSlug, onExit }: CourseDrillProps): ReactNode {
  const [states, setStates] = useState<Map<string, CourseReviewState> | null>(progress ? null : new Map());
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!progress) return;
    const keys = buildCourseDrill(document).episodes.flatMap((episode) => episode.steps.map((step) => step.key));
    let live = true;
    void progress
      .lookup(keys)
      .catch(() => new Map<string, CourseReviewState>())
      .then((found) => live && setStates(found));
    return () => {
      live = false;
    };
  }, [document, progress, round]);

  const drill = useMemo(() => (states ? buildCourseDrill(document, states, localToday()) : null), [document, states]);
  if (!drill) return <p className="meta">Loading your progress…</p>;
  if (!drill.episodes.length) {
    return (
      <div className="course-drill">
        <p className="meta">This course has no moves to drill.</p>
        <button type="button" className="btn-secondary" onClick={onExit}>
          Back to the course
        </button>
      </div>
    );
  }
  return (
    <DrillRun
      key={round}
      document={document}
      drill={drill}
      onResult={(result) => void progress?.record([{ ...result, courseSlug: courseSlug ?? '' }]).catch(() => undefined)}
      onAgain={() => {
        if (progress) setStates(null);
        setRound(round + 1);
      }}
      onExit={onExit}
    />
  );
}

interface DrillRunProps {
  document: CourseDocument;
  drill: Drill;
  onResult: (result: { key: string; san: string; correct: boolean }) => void;
  onAgain: () => void;
  onExit: () => void;
}

function DrillRun({ document, drill, onResult, onAgain, onExit }: DrillRunProps): ReactNode {
  const [at, setAt] = useState({ episode: 0, step: 0 });
  const [firstTries, setFirstTries] = useState<Map<string, { san: string; correct: boolean }>>(new Map());
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [judgement, setJudgement] = useState<Judgement | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const judgeRef = useRef(0);

  const episode = drill.episodes[at.episode];
  const step = episode?.steps[at.step];
  const done = !episode;
  const lastPlayed = episode && at.step > 0 ? episode.steps[at.step - 1] : undefined;
  const fen = step ? step.fenBefore : (lastPlayed?.node.fenAfter ?? '');
  const asked = drill.episodes.flatMap((each) => each.steps.filter((each) => each.asked));

  const advance = (): void => {
    judgeRef.current += 1;
    setAttempt(null);
    setJudgement(null);
    if (!episode) return;
    if (at.step + 1 < episode.steps.length) setAt({ episode: at.episode, step: at.step + 1 });
    else setAt({ episode: at.episode + 1, step: 0 });
  };

  // A move the learner does not play is made for them.
  useEffect(() => {
    if (!step || step.asked) return;
    const timer = window.setTimeout(advance, AUTO_MOVE_MS);
    return () => window.clearTimeout(timer);
  }, [at.episode, at.step, step?.asked]);

  const firstTry = (correct: boolean): void => {
    if (!step || firstTries.has(step.key)) return;
    setFirstTries(new Map(firstTries).set(step.key, { san: step.node.san, correct }));
    onResult({ key: step.key, san: step.node.san, correct });
  };

  const onMove = (san: string, fenAfter: string, uci: string): void => {
    if (!step?.asked) return;
    if (uci === step.node.uci) {
      firstTry(true);
      const note = document.episodes.find((each) => each.id === episode!.episodeId)?.notes.find((each) => each.nodeId === step.node.id)?.text.trim();
      setSaid(note ? `${san}. ${note}` : `${san}, yes.`);
      advance();
      return;
    }
    const tried = { fenBefore: step.fenBefore, fenAfter, san };
    const request = ++judgeRef.current;
    setAttempt(tried);
    setJudgement({ status: 'checking' });
    setSaid(null);
    judgeQuizMove({ ...tried, mover: step.fenBefore.split(' ')[1] === 'b' ? 'black' : 'white' })
      .then((move) => {
        if (request !== judgeRef.current) return;
        setJudgement({ status: 'ready', move });
      })
      .catch(() => request === judgeRef.current && setJudgement({ status: 'error' }));
  };

  // Recorded once rated; when the engine can't rate it, the next try counts.
  useEffect(() => {
    if (judgement?.status !== 'ready') return;
    firstTry(isAcceptedAlternative(judgement.move.quality));
  }, [judgement]);

  if (done) {
    const right = [...firstTries.values()].filter((each) => each.correct).length;
    const missed = [...firstTries.values()].filter((each) => !each.correct).map((each) => each.san);
    return (
      <div className="course-drill">
        <CoachCard avatar={<CoachAvatar persona={document.coachPersona} size="chat" />}>
          <p className="course-drill__score">
            {drill.mode === 'guess_move' ? `Your score: ${right} of ${firstTries.size}.` : `${right} of ${firstTries.size} right first time.`}
          </p>
          {missed.length > 0 ? <p>To go over again tomorrow: {missed.join(', ')}.</p> : <p>Every move right. They come back for review in a week.</p>}
        </CoachCard>
        <div className="course-player__actions">
          <button type="button" className="btn-primary" onClick={onAgain}>
            Drill again
          </button>
          <button type="button" className="btn-secondary" onClick={onExit}>
            Back to the course
          </button>
        </div>
      </div>
    );
  }

  const waiting = step?.asked && !attempt;
  const askedSoFar = asked.findIndex((each) => each === step) + 1;
  return (
    <div className="course-player__episode">
      <div className="course-player__board">
        <CoachBoard
          fen={attempt?.fenAfter ?? fen}
          orientation={document.learnerSide}
          mode={waiting ? 'answer' : 'peek'}
          disabled={!waiting}
          arrows={[]}
          highlights={[]}
          onUserMove={onMove}
        />
        <div className="course-player__nav">
          <span className="meta">
            {drill.episodes.length > 1 ? `Line ${at.episode + 1} of ${drill.episodes.length} · ` : ''}
            {firstTries.size} of {asked.length} moves
          </span>
          <button type="button" className="btn-secondary" onClick={onExit}>
            Stop the drill
          </button>
        </div>
      </div>
      <div className="course-player__words">
        <CoachCard avatar={<CoachAvatar persona={document.coachPersona} size="chat" />}>
          {at.episode === 0 && at.step === 0 && <p className="meta">{MODE_INTRO[drill.mode]}</p>}
          {said && <p>{said}</p>}
          {waiting && (
            <div className="course-player__quiz">
              <p className="course-player__prompt">
                {askedSoFar > 0 ? `Move ${askedSoFar}: ` : ''}
                {fen.split(' ')[1] === 'b' ? 'Black' : 'White'} to play.
              </p>
              <div className="course-player__actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    firstTry(false);
                    setSaid(`The move is ${step.node.san}.`);
                    advance();
                  }}
                >
                  Show the move
                </button>
              </div>
            </div>
          )}
          {step?.asked && attempt && (
            <AttemptFeedback
              attempt={attempt}
              judgement={judgement}
              answerSan={step.node.san}
              acceptLabel="Play the course move"
              onAccept={() => {
                setSaid(`The course plays ${step.node.san}.`);
                advance();
              }}
              onRetry={() => {
                judgeRef.current += 1;
                setAttempt(null);
                setJudgement(null);
              }}
              onReveal={() => {
                setSaid(`The move is ${step.node.san}.`);
                advance();
              }}
            />
          )}
        </CoachCard>
      </div>
    </div>
  );
}
