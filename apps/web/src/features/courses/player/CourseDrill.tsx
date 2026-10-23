import {
  buildCourseDrill,
  isPracticeDone,
  moveLabel,
  nextPracticeState,
  practiceArrow,
  practiceAsks,
  practiceProgress,
  practiceRoundsLeft,
  practiceShowsArrow,
  sideToMove,
  type CourseDrill as Drill,
  type CourseDrillStep,
  type CourseReviewState,
  type CourseStage,
  type PracticeMoveState
} from '@freechesscoach/chess-analysis';
import type { CourseDocument } from '@freechesscoach/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRightIcon } from '../../../components/Icon.js';
import { EvalBar } from '../../board/EvalBar.js';
import { CoachBoard } from '../../board/CoachBoard.js';
import { LineMoveExplorer } from '../../board/LineMoveExplorer.js';
import { MoveStrip } from '../../board/MoveStrip.js';
import { toBoardMarks } from '../courseArrows.js';
import { useProfileCoachVoice } from '../../../hooks/useProfileCoachVoice.js';
import { translateChessNotationForSpeech } from '../../../tts/sanToSpokenText.js';
import { playBoardSound } from '../../../sounds/board-sounds.js';
import { moveSound } from '../../../sounds/move-sounds.js';
import { BoardFlash, LINE_FLASH_MS, SUCCESS_FLASH_MS } from './BoardFlash.js';
import { CourseBoardLayout } from './CourseBoardLayout.js';
import { CoursePane } from './CoursePane.js';
import { STAGE_LABELS } from './CourseStageBar.js';
import { courseMoveList, type CourseEvals } from './course-move-list.js';
import { localToday, type CourseProgressStore } from './course-progress.js';
import { withoutMove } from './course-steps.js';
import { drillLine, lineChange, lineProgress } from './drill-line.js';
import { MoveLog, type MoveLogEntry } from './MoveLog.js';

/** The stages the learner plays themselves (§11). */
export type PlayedStage = Exclude<CourseStage, 'play_through'>;

export interface DrillRunPlace {
  episode: string;
  step: number;
}

export interface CourseDrillProps {
  document: CourseDocument;
  /** The engine's figures for the course's moves, for the evaluation bar. */
  evals?: CourseEvals;
  stage: PlayedStage;
  /** Where results go; absent in the editor's preview, which saves nothing. */
  progress?: CourseProgressStore | null;
  courseSlug?: string;
  /** Practice: the moves already known (drill key → state), saved from last time. */
  knownMoves?: Readonly<Record<string, PracticeMoveState>>;
  onKnownMoves?: (practice: Record<string, PracticeMoveState>) => void;
  /** Where the run was left (an episode id and the moves of it played): it picks up there. */
  startRun?: DrillRunPlace | null;
  /** The run moved on (null once it is over or a new round starts), to be saved. */
  onRun?: (run: DrillRunPlace | null) => void;
  /** The stage is finished; the learner may go on to the next one. */
  onStageDone: (stage: PlayedStage) => void;
  /** Opens the next stage; its button is named after it ("Drill ›"). */
  onNextStage: () => void;
  onExit: () => void;
  /** The board layout's desktop arrangement (CourseBoardLayout). */
  isDesktop?: boolean;
}

/** The drills show no evaluations: they are about remembering the moves. */
const NO_EVALS: CourseEvals = {};

/** Pause before a move the learner does not play is made for them. */
const AUTO_MOVE_MS = 600;

/** A wrong move stays on the board, crossed out, this long before the piece goes back. */
const WRONG_MOVE_SHOW_MS = 1100;

/** The right move stays on the board this long, with the success mark, before the drill goes on. */
const RIGHT_MOVE_PAUSE_MS = 2500;

const MODE_INTRO: Record<Drill['mode'], string> = {
  learner_side: 'Play your side; the other side’s moves are played for you.',
  find_move: 'Find the move in each position.',
  guess_move: 'Guess each move of the game; your score is kept.'
};

function intro(stage: PlayedStage, drill: Drill): string {
  if (stage === 'practice') return 'Play your moves. The arrows show them at first, then fewer each round, then none.';
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
 * move counts for the review schedule. Any other move is a miss, said at
 * once, the piece shown on its square with a ✗ for a moment and then put
 * back: no engine runs here, the course's
 * move is the answer, and the course's own word on the move tried (a
 * tempting move's "why") is said when it has one.
 */
export function CourseDrill({ document, evals = NO_EVALS, stage, progress, courseSlug, knownMoves, onKnownMoves, startRun, onRun, onStageDone, onNextStage, onExit, isDesktop = false }: CourseDrillProps): ReactNode {
  const reviewed = stage !== 'practice';
  const sides = stage === 'full_drill' ? 'both' : 'learner';
  const [states, setStates] = useState<Map<string, CourseReviewState> | null>(progress && reviewed ? null : new Map());
  const [practice, setPractice] = useState<Map<string, PracticeMoveState>>(() => new Map(Object.entries(knownMoves ?? {})));
  const practiceChanged = useRef(false);
  useEffect(() => {
    if (practiceChanged.current) onKnownMoves?.(Object.fromEntries(practice));
  }, [practice]);
  const [round, setRound] = useState(0);
  /** Used once, by the run the learner left; a new round starts from the top. */
  const resumeRef = useRef(startRun ?? null);
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
    if (!drill || reviewed) return drill && { drill, arrowKeys: new Set<string>(), roundLabel: null };
    const next = practiceRound(drill, practice);
    const keys = drill.episodes.flatMap((episode) => episode.steps.filter((step) => step.asked).map((step) => step.key));
    return { ...next, roundLabel: `Round ${round + 1} of ${round + Math.max(1, practiceRoundsLeft(keys, practice))}` };
  }, [drill, reviewed, round]);

  // Practice is done only once every move is known, after this round's last answer landed.
  const askedKeys = drill?.episodes.flatMap((episode) => episode.steps.filter((step) => step.asked).map((step) => step.key)) ?? [];
  const stageDone = finished !== null && (reviewed || isPracticeDone(askedKeys, practice));
  useEffect(() => {
    if (stageDone) onStageDone(stage);
  }, [stageDone]);

  if (!run) return <p className="meta course-summary">Loading your progress…</p>;
  if (!drill?.episodes.length) {
    return (
      <div className="course-drill course-summary">
        <p className="meta">This course has no moves to play here.</p>
        <button type="button" className="btn-secondary" onClick={onExit}>
          Back to the course
        </button>
      </div>
    );
  }

  const again = (): void => {
    resumeRef.current = null;
    onRun?.(null);
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
        roundsDone={round + 1}
        onAgain={again}
        onNextStage={onNextStage}
        onExit={onExit}
      />
    );
  }

  return (
    <DrillRun
      key={round}
      resume={round === 0 ? resumeRef.current : null}
      onAt={onRun}
      document={document}
      evals={evals}
      stage={stage}
      drill={run.drill}
      introText={round === 0 ? intro(stage, drill) : stage === 'practice' ? 'Again, with fewer arrows.' : null}
      arrowKeys={run.arrowKeys}
      roundLabel={run.roundLabel}
      progressBar={
        reviewed ? null : <progress className="course-drill__progress" value={practiceProgress(askedKeys, practice)} max={1} aria-label="Practice progress" />
      }
      isDesktop={isDesktop}
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
  roundsDone: number;
  onAgain: () => void;
  onNextStage: () => void;
  onExit: () => void;
}

function StageSummary({ document, stage, drill, result, practiceKeys, practice, roundsDone, onAgain, onNextStage, onExit }: StageSummaryProps): ReactNode {
  const tries = [...result.firstTries.values()];
  const right = tries.filter((each) => each.correct).length;
  const missed = tries.filter((each) => !each.correct).map((each) => each.san);

  if (stage === 'practice') {
    const done = isPracticeDone(practiceKeys, practice);
    const total = roundsDone + practiceRoundsLeft(practiceKeys, practice);
    const next = practiceRound(drill, practice);
    const nextAsked = next.drill.episodes.flatMap((episode) => episode.steps.filter((step) => step.asked)).length;
    const nextLine =
      next.arrowKeys.size === 0
        ? 'Next round: no arrows.'
        : next.arrowKeys.size === nextAsked
          ? 'Next round: arrows on every move.'
          : `Next round: arrows on ${next.arrowKeys.size} of ${nextAsked} moves.`;
    return (
      <div className="course-drill course-summary">
        <CoursePane persona={document.coachPersona}>
          <p className="course-drill__score">{done ? 'You know every move.' : `Round ${roundsDone} of ${total} done.`}</p>
          <progress className="course-drill__progress" value={practiceProgress(practiceKeys, practice)} max={1} aria-label="Practice progress" />
          {missed.length > 0 && <p>Missed: {missed.join(', ')}. The arrow comes back for {missed.length === 1 ? 'it' : 'them'}.</p>}
          <p>{done ? 'Now play them with no arrows at all.' : nextLine}</p>
        </CoursePane>
        <div className="course-player__actions">
          <button type="button" className="btn-primary course-player__next" aria-label={done ? `Next: ${STAGE_LABELS.drill}` : undefined} onClick={done ? onNextStage : onAgain}>
            {done ? (
              <>
                {STAGE_LABELS.drill}
                <ChevronRightIcon width={16} height={16} />
              </>
            ) : (
              'Next round'
            )}
          </button>
          <button type="button" className="btn-secondary" onClick={onExit}>
            Back to the course
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="course-drill course-summary">
      <CoursePane persona={document.coachPersona}>
        <p className="course-drill__score">
          {drill.mode === 'guess_move' ? `Your score: ${right} of ${tries.length}.` : `${right} of ${tries.length} right first time.`}
        </p>
        {missed.length > 0 ? <p>To go over again tomorrow: {missed.join(', ')}.</p> : <p>Every move right. They come back for review in a week.</p>}
        {stage === 'full_drill' && <p>That is the whole course, both sides.</p>}
      </CoursePane>
      <div className="course-player__actions">
        {stage === 'drill' && (
          <button type="button" className="btn-primary course-player__next" aria-label={`Next: ${STAGE_LABELS.full_drill}`} onClick={onNextStage}>
            {STAGE_LABELS.full_drill}
            <ChevronRightIcon width={16} height={16} />
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
  resume: DrillRunPlace | null;
  onAt: ((run: DrillRunPlace | null) => void) | undefined;
  document: CourseDocument;
  evals: CourseEvals;
  stage: PlayedStage;
  drill: Drill;
  introText: string | null;
  /** Asked moves whose arrow shows (practice). */
  arrowKeys: ReadonlySet<string>;
  /** Practice: "Round 2 of 3". */
  roundLabel: string | null;
  /** Practice: how far the learner is, beside the status in the explorer column. */
  progressBar: ReactNode;
  isDesktop: boolean;
  /** The first try at each asked move. */
  onResult: (result: { key: string; san: string; correct: boolean }) => void;
  onFinished: (result: RoundResult) => void;
  onExit: () => void;
}

function DrillRun({ resume, onAt, document, evals, stage, drill, introText, arrowKeys, roundLabel, progressBar, isDesktop, onResult, onFinished, onExit }: DrillRunProps): ReactNode {
  const [at, setAt] = useState(() => {
    const index = resume ? drill.episodes.findIndex((each) => each.episodeId === resume.episode) : -1;
    const found = drill.episodes[index];
    return found && resume ? { episode: index, step: Math.min(resume.step, found.steps.length - 1) } : { episode: 0, step: 0 };
  });
  const [firstTries, setFirstTries] = useState<Map<string, { san: string; correct: boolean }>>(new Map());
  /** The move just tried that is not the course's, and the course's own
   * word on it when it has one. The piece is shown
   * crossed out for a moment (`tried`), then put back. */
  const [wrong, setWrong] = useState<{ san: string; why: string | null } | null>(null);
  /** The last two moves played, across episodes (the move log). */
  const [history, setHistory] = useState<{ step: CourseDrillStep; episodeId: string }[]>([]);
  /** The line the learner has played a move of, so a line's heading says "done with …" only until then. */
  const [movedIn, setMovedIn] = useState(-1);
  /** A right move is on the board for a moment before the drill goes on. */
  const [pausing, setPausing] = useState(false);
  /** The line just started, named over the board for a second; the drill waits. */
  const [announced, setAnnounced] = useState<number | null>(null);
  const lastAnnounced = useRef<string | null>(null);
  const pauseTimer = useRef<number | undefined>(undefined);
  const triedTimer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(pauseTimer.current);
      window.clearTimeout(triedTimer.current);
    },
    []
  );
  /** The wrong move just tried: the board shows it with a ✗, then puts the piece back. */
  const [tried, setTried] = useState<string | null>(null);

  const episode = drill.episodes[at.episode];
  const step = episode?.steps[at.step];
  const done = !episode;
  const lastPlayed = episode && at.step > 0 ? episode.steps[at.step - 1] : undefined;
  const fen = step ? (pausing ? step.node.fenAfter : (tried ?? step.fenBefore)) : (lastPlayed?.node.fenAfter ?? '');
  // The bar reads the position on the board: the last move's figure, else the one before it, else even.
  const onBoard = step ? (pausing ? step.node.id : step.node.parentId) : lastPlayed?.node.id;
  const barCp = (onBoard ? evals[onBoard]?.cp : undefined) ?? 0;
  const asked = drill.episodes.flatMap((each) => each.steps.filter((each) => each.asked));

  /** The coach reads the note on a move as it comes in (the app's own voice, when the learner has it on). */
  const voice = useProfileCoachVoice(document.coachPersona);
  const speak = (nodeId: string): void => {
    if (!voice.autoplayEnabled) return;
    const text = document.episodes.flatMap((each) => each.plies).find((ply) => ply.nodeId === nodeId && ply.text.trim())?.text.trim();
    if (text) voice.play(`course:${nodeId}`, translateChessNotationForSpeech(text));
    else voice.stop();
  };

  const advance = (): void => {
    setWrong(null);
    if (!episode) return;
    if (step?.asked) setMovedIn(at.episode);
    // Said when it shows: a practice move's note is on screen while its arrow is, so it was read then.
    if (step && !(step.asked && arrowKeys.has(step.key))) speak(step.node.id);
    if (step) setHistory((prev) => [...prev.slice(-1), { step, episodeId: episode.episodeId }]);
    if (at.step + 1 < episode.steps.length) setAt({ episode: at.episode, step: at.step + 1 });
    else setAt({ episode: at.episode + 1, step: 0 });
  };

  // A new line is named over the board before its first move.
  const lineTitle = drillLine(document, episode?.episodeId)?.title ?? null;
  useEffect(() => {
    if (!lineTitle || lineTitle === lastAnnounced.current) return;
    lastAnnounced.current = lineTitle;
    setAnnounced(at.episode);
  }, [lineTitle, at.episode]);
  const announcing = announced === at.episode && lineTitle !== null && drill.episodes.length > 1;

  // A move the learner does not play is made for them.
  useEffect(() => {
    if (!step || step.asked || announcing) return;
    const timer = window.setTimeout(() => {
      knock(step.node.san, false);
      advance();
    }, AUTO_MOVE_MS);
    return () => window.clearTimeout(timer);
  }, [at.episode, at.step, step?.asked, announcing]);

  // Practice: the note on the move to play shows with its arrow, and is read as it comes in.
  useEffect(() => {
    if (step?.asked && arrowKeys.has(step.key) && !announcing) speak(step.node.id);
  }, [at.episode, at.step, announcing]);

  const firstTry = (correct: boolean): void => {
    if (!step || firstTries.has(step.key)) return;
    setFirstTries(new Map(firstTries).set(step.key, { san: step.node.san, correct }));
    onResult({ key: step.key, san: step.node.san, correct });
  };

  const onMove = (san: string, fenAfter: string, uci: string): void => {
    if (!step?.asked || pausing || announcing || tried) return;
    knock(san, true);
    if (uci === step.node.uci) {
      firstTry(true);
      setPausing(true);
      pauseTimer.current = window.setTimeout(() => {
        setPausing(false);
        advance();
      }, RIGHT_MOVE_PAUSE_MS);
      return;
    }
    // Any other move is wrong: no engine, the course's move is the answer.
    // The piece stays on its square with a ✗ for a moment, then goes back.
    firstTry(false);
    setTried(fenAfter);
    triedTimer.current = window.setTimeout(() => setTried(null), WRONG_MOVE_SHOW_MS);
    playBoardSound('bad');
    const plain = (move: string): string => move.replace(/[+#?!]+$/, '');
    const tempting = lines.find((ply) => ply.nodeId === step.node.id)?.tempting?.find((each) => plain(each.san) === plain(san));
    setWrong({ san, why: tempting?.why.trim() || null });
  };

  useEffect(() => {
    if (done) onFinished({ firstTries });
  }, [done]);
  // Where the learner is, for picking the run up again.
  useEffect(() => {
    onAt?.(episode ? { episode: episode.episodeId, step: at.step } : null);
  }, [at.episode, at.step, done]);
  if (done) return null;

  const waiting = Boolean(step?.asked) && !pausing && !announcing && !tried;
  const hinted = Boolean(step && arrowKeys.has(step.key));
  const hint = waiting && step && hinted ? toBoardMarks([practiceArrow(step.node)]) : null;
  // The course's line on each move: what practice says a move does.
  // A run is a whole line, so several episodes' lines: the first one on a move is its own.
  const lines = document.episodes.flatMap((each) => each.plies);
  const who = (fenBefore: string, learnerPlays: boolean): string =>
    stage === 'full_drill' ? (sideToMove(fenBefore) === 'white' ? 'White' : 'Black') : learnerPlays ? 'You' : 'Opponent';
  // One running sequence: a new episode does not start the log afresh.
  const played: MoveLogEntry[] = history.map(({ step: each }) => ({
    label: moveLabel(each.fenBefore, each.node.san),
    side: sideToMove(each.fenBefore),
    who: who(each.fenBefore, each.asked),
    note: lines.find((ply) => ply.nodeId === each.node.id)?.text.trim() || null,
    result: each.asked ? (firstTries.get(each.key)?.correct === false ? 'shown' : 'right') : undefined
  }));
  const showMove = (): void => {
    firstTry(false);
    if (step) knock(step.node.san, true);
    advance();
  };
  // The current line, from the course's start through the moves played so far.
  const line = episode ? courseMoveList(document, episode.steps.map((each) => each.node), NO_EVALS) : null;
  const shown = line ? line.leadIn + at.step : 0;
  const lineMoves = line?.sanMoves.slice(0, shown) ?? [];
  const linePositions = line?.positions.slice(0, shown + 1) ?? [];

  const thisLine = drillLine(document, episode?.episodeId);
  const change = lineChange(at.episode > 0 ? drillLine(document, drill.episodes[at.episode - 1]?.episodeId) : null, thisLine);
  // Every line gets its name; a new one also says which was finished.
  const lineHeading =
    thisLine && drill.episodes.length > 1 ? (
      <div className="course-drill__line">
        {change?.done && movedIn !== at.episode && <p className="course-drill__line-done">Done with {change.done}. Now: {change.now}</p>}
        {isDesktop && <p className="course-drill__line-title">{thisLine.title}</p>}
        {thisLine.note && <p className="meta">{thisLine.note}</p>}
      </div>
    ) : null;

  const runLines = lineProgress(document, drill.episodes, at);
  const lineList =
    runLines.length > 1 ? (
      <ol className="course-drill__lines" aria-label="Lines in this run">
        {runLines.map((each) => (
          <li key={each.title} aria-current={each.current ? 'step' : undefined} className={each.done >= each.total ? 'course-drill__lines-done' : undefined}>
            <span>{each.title}</span>
            <span className="meta">
              {each.done}/{each.total}
            </span>
          </li>
        ))}
      </ol>
    ) : null;

  const status = (
    <span className="meta course-drill__status">
      {/* In practice only the sequence matters, not which episode it is. */}
      {roundLabel ? `${roundLabel} · ` : ''}
      {stage !== 'practice' && drill.episodes.length > 1 ? `Line ${at.episode + 1} of ${drill.episodes.length} · ` : ''}
      {firstTries.size}/{asked.length}
    </span>
  );
  const stop = (
    <button type="button" className="btn-secondary" onClick={onExit}>
      {stage === 'practice' ? 'Stop practising' : 'Stop the drill'}
    </button>
  );
  const nav = (
    <div className="course-player__nav">{status}</div>
  );

  const coach = (
    <CoursePane
      persona={document.coachPersona}
      sound={voice.enabled ? { on: voice.autoplayEnabled, onChange: voice.setAutoplayEnabled } : undefined}
      compact={!isDesktop}
      title={thisLine && drill.episodes.length > 1 ? thisLine.title : undefined}
    >
      {lineHeading}
      {/* The move to play first: on a phone the pane shows only a few lines. */}
      {step && (
        <MoveLog
          played={played}
          current={{
            side: sideToMove(step.fenBefore),
            who: who(step.fenBefore, step.asked),
            // Practice names the move while its arrow shows; the drills never do.
            label: !step.asked || (stage === 'practice' && hinted) ? moveLabel(step.fenBefore, step.node.san) : null,
            yours: step.asked,
            // Practice says what the move does; with the move hidden, its name is blanked out of the note.
            purpose:
              stage === 'practice' && step.asked ? withoutMove(lines.find((ply) => ply.nodeId === step.node.id)?.text.trim() || null, hinted ? null : step.node.san) : null
          }}
          // The arrow already shows the move; "Show the move" is for when it has gone, or after a miss.
          action={
            waiting && (!hinted || wrong) ? (
              <button type="button" className="btn-secondary" onClick={showMove}>
                Show the move
              </button>
            ) : undefined
          }
        />
      )}
      {step?.asked && wrong && (
        <div className="course-player__quiz" role="status">
          <p>
            {wrong.san} is not it. {wrong.why ?? 'Try again.'}
          </p>
        </div>
      )}
      {introText && firstTries.size === 0 && !wrong && <p className="meta">{introText}</p>}
    </CoursePane>
  );

  return (
    <CourseBoardLayout
      isDesktop={isDesktop}
      explorer={
        <>
          <div className="course-drill__panel">
            <p className="course-drill__stage">{stage === 'practice' ? 'Practising' : stage === 'drill' ? 'Drilling your side' : 'Drilling both sides'}</p>
            {status}
            {lineList}
            {progressBar}
            {stop}
          </div>
          {line && (
            <LineMoveExplorer
              sanMoves={lineMoves}
              classifiedMoves={[]}
              positions={linePositions}
              currentPly={shown}
              onSelect={() => undefined}
              showNotes={false}
              dimmedThroughPly={line.leadIn}
              hideNav
            />
          )}
        </>
      }
      board={
        <>
          <div className="session-board-row course-board-host">
            {pausing && <BoardFlash content={{ kind: 'success' }} ms={SUCCESS_FLASH_MS} />}
            {tried && <BoardFlash content={{ kind: 'wrong' }} ms={SUCCESS_FLASH_MS} />}
            {announcing && lineTitle && <BoardFlash content={{ kind: 'line', title: lineTitle }} ms={LINE_FLASH_MS} onDone={() => setAnnounced(null)} />}
            <EvalBar ply={0} classifiedMoves={[]} orientation={document.learnerSide} cpOverride={barCp} />
            <CoachBoard
              fen={fen}
              orientation={document.learnerSide}
              mode={waiting ? 'answer' : 'peek'}
              disabled={!waiting}
              arrows={hint?.arrows ?? []}
              highlights={hint?.highlights ?? []}
              mateEffect
              onUserMove={onMove}
            />
          </div>
        </>
      }
      coach={coach}
      strip={
        <div className="course-layout__strip">
          {line && lineMoves.length > 0 && (
            <MoveStrip
              sanMoves={lineMoves}
              classifiedMoves={[]}
              positions={linePositions}
              currentPly={shown - 1}
              momentPlies={[]}
              onSelect={() => undefined}
              start={line.start}
              dimmedThroughPly={line.leadIn}
            />
          )}
        </div>
      }
      bottomBar={nav}
    />
  );
}

/** A drill's move sound: the learner's knock or the other side's softer
 * one, the chime on a check; no bad or great for the moves themselves. */
function knock(san: string, own: boolean): void {
  playBoardSound(moveSound({ san, mover: own ? 'white' : 'black', learnerSide: 'white' }));
}

/** The next practice round: the moves not yet known, and which of them show
 * their arrow (every other one while the arrows thin out). */
function practiceRound(drill: Drill, practice: ReadonlyMap<string, PracticeMoveState>): { drill: Drill; arrowKeys: Set<string> } {
  const episodes = drill.episodes
    .map((episode) => ({ ...episode, steps: episode.steps.map((step) => ({ ...step, asked: step.asked && practiceAsks(practice.get(step.key)) })) }))
    .filter((episode) => episode.steps.some((step) => step.asked));
  const arrowKeys = new Set(
    episodes.flatMap((episode) =>
      episode.steps.filter((step) => step.asked).flatMap((step, index) => (practiceShowsArrow(practice.get(step.key), index) ? [step.key] : []))
    )
  );
  return { drill: { ...drill, episodes }, arrowKeys };
}
