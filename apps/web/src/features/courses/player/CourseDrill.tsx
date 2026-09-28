import {
  buildCourseDrill,
  isPracticeDone,
  nextPracticeState,
  practiceArrow,
  practiceAsks,
  practiceShowsArrow,
  type CourseDrill as Drill,
  type CourseReviewState,
  type CourseStage,
  type PracticeMoveState
} from '@freechesscoach/chess-analysis';
import type { CourseDocument } from '@freechesscoach/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CoachAvatar } from '../../../components/CoachAvatar.js';
import { CoachCard } from '../../../components/CoachCard.js';
import { CoachBoard } from '../../board/CoachBoard.js';
import { toBoardMarks } from '../courseArrows.js';
import { AttemptFeedback, type Attempt, type Judgement } from './AttemptFeedback.js';
import { localToday, type CourseProgressStore } from './course-progress.js';
import { isAcceptedAlternative } from './course-steps.js';
import { judgeQuizMove } from './judge-quiz-move.js';

/** The stages the learner plays themselves (§11). */
export type PlayedStage = Exclude<CourseStage, 'play_through'>;

export interface CourseDrillProps {
  document: CourseDocument;
  stage: PlayedStage;
  /** Where results go; absent in the editor's preview, which saves nothing. */
  progress?: CourseProgressStore | null;
  courseSlug?: string;
  /** Practice: the moves already known (drill key → state), saved from last time. */
  knownMoves?: Readonly<Record<string, PracticeMoveState>>;
  onKnownMoves?: (practice: Record<string, PracticeMoveState>) => void;
  /** The stage is finished; the learner may go on to the next one. */
  onStageDone: (stage: PlayedStage) => void;
  /** Opens the next stage ("Now without arrows", "Now both sides"). */
  onNextStage: () => void;
  onExit: () => void;
}

/** Pause before a move the learner does not play is made for them. */
const AUTO_MOVE_MS = 600;

const MODE_INTRO: Record<Drill['mode'], string> = {
  learner_side: 'Play your side; the other side’s moves are played for you.',
  find_move: 'Find the move in each position.',
  guess_move: 'Guess each move of the game; your score is kept.'
};

function intro(stage: PlayedStage, drill: Drill): string {
  if (stage === 'practice') return 'Play your moves. The arrow shows the move until you know it; then it goes.';
  if (stage === 'full_drill') return 'Play both sides now: every move of the line is yours.';
  return MODE_INTRO[drill.mode];
}

interface RoundResult {
  firstTries: Map<string, { san: string; correct: boolean }>;
}

/**
 * docs/courses.md §11 steps 3–4: the learner plays the course's moves.
 * Practice asks their own moves with the arrow on, then off, round after
 * round until each is known, and saves nothing. The drill asks their side
 * with no arrows, the full drill both sides; there the first try at each
 * move counts for the review schedule. A different move is rated in the
 * browser like the quiz (a move about as good is accepted, no penalty).
 */
export function CourseDrill({ document, stage, progress, courseSlug, knownMoves, onKnownMoves, onStageDone, onNextStage, onExit }: CourseDrillProps): ReactNode {
  const reviewed = stage !== 'practice';
  const sides = stage === 'full_drill' ? 'both' : 'learner';
  const [states, setStates] = useState<Map<string, CourseReviewState> | null>(progress && reviewed ? null : new Map());
  const [practice, setPractice] = useState<Map<string, PracticeMoveState>>(() => new Map(Object.entries(knownMoves ?? {})));
  const practiceChanged = useRef(false);
  useEffect(() => {
    if (practiceChanged.current) onKnownMoves?.(Object.fromEntries(practice));
  }, [practice]);
  const [round, setRound] = useState(0);
  const [finished, setFinished] = useState<RoundResult | null>(null);

  useEffect(() => {
    if (!progress || !reviewed) return;
    const keys = buildCourseDrill(document, new Map(), '', sides).episodes.flatMap((episode) => episode.steps.map((step) => step.key));
    let live = true;
    void progress
      .lookup(keys)
      .catch(() => new Map<string, CourseReviewState>())
      .then((found) => live && setStates(found));
    return () => {
      live = false;
    };
  }, [document, progress, reviewed, sides, round]);

  const drill = useMemo(() => (states ? buildCourseDrill(document, states, localToday(), sides) : null), [document, states, sides]);
  // Practice: a known move is played for the learner; the arrow shows until they know it.
  // Fixed for the round, so a miss brings the arrow back next round.
  const run = useMemo(() => {
    if (!drill || reviewed) return drill && { drill, arrowKeys: new Set<string>() };
    const episodes = drill.episodes
      .map((episode) => ({ ...episode, steps: episode.steps.map((step) => ({ ...step, asked: step.asked && practiceAsks(practice.get(step.key)) })) }))
      .filter((episode) => episode.steps.some((step) => step.asked));
    const arrowKeys = new Set(episodes.flatMap((episode) => episode.steps.filter((step) => step.asked && practiceShowsArrow(practice.get(step.key))).map((step) => step.key)));
    return { drill: { ...drill, episodes }, arrowKeys };
  }, [drill, reviewed, round]);

  // Practice is done only once every move is known, after this round's last answer landed.
  const askedKeys = drill?.episodes.flatMap((episode) => episode.steps.filter((step) => step.asked).map((step) => step.key)) ?? [];
  const stageDone = finished !== null && (reviewed || isPracticeDone(askedKeys, practice));
  useEffect(() => {
    if (stageDone) onStageDone(stage);
  }, [stageDone]);

  if (!run) return <p className="meta">Loading your progress…</p>;
  if (!drill?.episodes.length) {
    return (
      <div className="course-drill">
        <p className="meta">This course has no moves to play here.</p>
        <button type="button" className="btn-secondary" onClick={onExit}>
          Back to the course
        </button>
      </div>
    );
  }

  const again = (): void => {
    setFinished(null);
    if (progress && reviewed) setStates(null);
    setRound(round + 1);
  };

  if (finished) {
    return (
      <StageSummary
        document={document}
        stage={stage}
        drill={drill}
        result={finished}
        practiceKeys={askedKeys}
        practice={practice}
        onAgain={again}
        onNextStage={onNextStage}
        onExit={onExit}
      />
    );
  }

  return (
    <DrillRun
      key={round}
      document={document}
      stage={stage}
      drill={run.drill}
      introText={round === 0 ? intro(stage, drill) : stage === 'practice' ? 'Again, with fewer arrows.' : null}
      arrowKeys={run.arrowKeys}
      onResult={(result) => {
        if (reviewed) void progress?.record([{ ...result, courseSlug: courseSlug ?? '' }]).catch(() => undefined);
        else {
          practiceChanged.current = true;
          setPractice((prev) => new Map(prev).set(result.key, nextPracticeState(prev.get(result.key), result.correct)));
        }
      }}
      onFinished={setFinished}
      onExit={onExit}
    />
  );
}

interface StageSummaryProps {
  document: CourseDocument;
  stage: PlayedStage;
  drill: Drill;
  result: RoundResult;
  practiceKeys: string[];
  practice: ReadonlyMap<string, PracticeMoveState>;
  onAgain: () => void;
  onNextStage: () => void;
  onExit: () => void;
}

function StageSummary({ document, stage, drill, result, practiceKeys, practice, onAgain, onNextStage, onExit }: StageSummaryProps): ReactNode {
  const tries = [...result.firstTries.values()];
  const right = tries.filter((each) => each.correct).length;
  const missed = tries.filter((each) => !each.correct).map((each) => each.san);
  const avatar = <CoachAvatar persona={document.coachPersona} size="chat" />;

  if (stage === 'practice') {
    const known = practiceKeys.filter((key) => practice.get(key) === 'cleared').length;
    const done = isPracticeDone(practiceKeys, practice);
    return (
      <div className="course-drill">
        <CoachCard avatar={avatar}>
          <p className="course-drill__score">{done ? 'You know every move.' : `${known} of ${practiceKeys.length} moves known.`}</p>
          <p>{done ? 'Now play them with no arrows at all.' : 'Another round: the moves you know are played for you, and fewer arrows show.'}</p>
        </CoachCard>
        <div className="course-player__actions">
          <button type="button" className="btn-primary" onClick={done ? onNextStage : onAgain}>
            {done ? 'Now without arrows' : 'Next round'}
          </button>
          <button type="button" className="btn-secondary" onClick={onExit}>
            Back to the course
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="course-drill">
      <CoachCard avatar={avatar}>
        <p className="course-drill__score">
          {drill.mode === 'guess_move' ? `Your score: ${right} of ${tries.length}.` : `${right} of ${tries.length} right first time.`}
        </p>
        {missed.length > 0 ? <p>To go over again tomorrow: {missed.join(', ')}.</p> : <p>Every move right. They come back for review in a week.</p>}
        {stage === 'full_drill' && <p>That is the whole course, both sides.</p>}
      </CoachCard>
      <div className="course-player__actions">
        {stage === 'drill' && (
          <button type="button" className="btn-primary" onClick={onNextStage}>
            Now both sides
          </button>
        )}
        <button type="button" className={stage === 'drill' ? 'btn-secondary' : 'btn-primary'} onClick={onAgain}>
          {stage === 'drill' ? 'Drill again' : 'Play both sides again'}
        </button>
        <button type="button" className="btn-secondary" onClick={onExit}>
          Back to the course
        </button>
      </div>
    </div>
  );
}

interface DrillRunProps {
  document: CourseDocument;
  stage: PlayedStage;
  drill: Drill;
  introText: string | null;
  /** Asked moves whose arrow shows (practice). */
  arrowKeys: ReadonlySet<string>;
  /** The first try at each asked move. */
  onResult: (result: { key: string; san: string; correct: boolean }) => void;
  onFinished: (result: RoundResult) => void;
  onExit: () => void;
}

function DrillRun({ document, stage, drill, introText, arrowKeys, onResult, onFinished, onExit }: DrillRunProps): ReactNode {
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

  useEffect(() => {
    if (done) onFinished({ firstTries });
  }, [done]);
  if (done) return null;

  const waiting = step?.asked && !attempt;
  const askedSoFar = asked.findIndex((each) => each === step) + 1;
  const hint = waiting && step && arrowKeys.has(step.key) ? toBoardMarks([practiceArrow(step.node)]) : null;
  return (
    <div className="course-player__episode">
      <div className="course-player__board">
        <CoachBoard
          fen={attempt?.fenAfter ?? fen}
          orientation={document.learnerSide}
          mode={waiting ? 'answer' : 'peek'}
          disabled={!waiting}
          arrows={hint?.arrows ?? []}
          highlights={hint?.highlights ?? []}
          onUserMove={onMove}
        />
        <div className="course-player__nav">
          <span className="meta">
            {drill.episodes.length > 1 ? `Line ${at.episode + 1} of ${drill.episodes.length} · ` : ''}
            {firstTries.size} of {asked.length} moves
          </span>
          <button type="button" className="btn-secondary" onClick={onExit}>
            {stage === 'practice' ? 'Stop practising' : 'Stop the drill'}
          </button>
        </div>
      </div>
      <div className="course-player__words">
        <CoachCard avatar={<CoachAvatar persona={document.coachPersona} size="chat" />}>
          {introText && firstTries.size === 0 && !attempt && <p className="meta">{introText}</p>}
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
