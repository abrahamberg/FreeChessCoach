import { captureWords, courseNodeAncestry, lineBalance, TACTIC_MOTIF_PHRASES, type CourseSkeleton } from '@freechesscoach/chess-analysis';
import type { CourseBudget } from './budget.js';
import { capitalise, nodeLabel, promptVideos, type CoursePromptContext } from './context.js';

/** docs/courses.md §6.3, one playbook per kind, filled from the skeleton
 * (§5.5), the budget and the course. Missing facts are named as missing, so
 * no `{placeholder}` ever reaches the model. */
export function buildCoursePlaybook(context: CoursePromptContext, budget: CourseBudget): string {
  return [kindPlaybook(context, budget), productsPlaybook(context)].filter(Boolean).join('\n');
}

function kindPlaybook(context: CoursePromptContext, budget: CourseBudget): string {
  switch (context.kind) {
    case 'trap':
      return trapPlaybook(context, budget, context.skeleton?.kind === 'trap' ? context.skeleton : null);
    case 'opening':
      return openingPlaybook(context);
    case 'puzzle':
      return puzzlePlaybook(context, context.skeleton?.kind === 'puzzle' ? context.skeleton : null);
    case 'tactics':
      return tacticsPlaybook(context, context.skeleton?.kind === 'tactics' ? context.skeleton : null);
    case 'master_game':
      return masterGamePlaybook(context);
  }
}

/** docs/courses.md §13.2: what the YouTube video and the reel do for this
 * kind, for the videos the course makes. */
const VIDEO_PLAYBOOK: Record<CoursePromptContext['kind'], string> = {
  trap: 'the setup, the bait and why it looks natural, the punishment, and how to stay safe; at the bait and the answer, play out the tempting moves.',
  opening: 'the plan, what each learner move is for, each sideline, each trap inside; the tempting moves where the opponent can go wrong.',
  tactics: 'the cue first, then each example with the tempting moves and why they fail.',
  puzzle: 'the thinking method: at every learner move, the checks, captures and threats in that order, which look right, why they fail, then the move.',
  master_game: 'a storytelling recap: the players (headers only), the turning points, and at each the tempting moves and why the master avoided them.'
};

const REEL_PLAYBOOK: Record<CoursePromptContext['kind'], string> = {
  trap: 'the bait and the punishment.',
  opening: 'the one trap or idea a player of this opening must know.',
  tactics: 'the clearest example, as a puzzle.',
  puzzle: 'the position and the question ("White to play. Mate in 3."), then the solution.',
  master_game: 'the single brilliant move, blunder or finish, never a summary of the game.'
};

function productsPlaybook(context: CoursePromptContext): string {
  const videos = promptVideos(context);
  return [videos.video && `YouTube video: ${VIDEO_PLAYBOOK[context.kind]}`, videos.reel && `Reel: ${REEL_PLAYBOOK[context.kind]}`].filter(Boolean).join('\n');
}

/** Episodes the outline should have, per kind (§6.4's `{episodeRange}`). */
export function episodeRange(context: CoursePromptContext): string {
  switch (context.kind) {
    case 'trap':
      return '6';
    case 'opening':
      return `one chapter per line (${context.lines.length}), plus one episode per trap and the recap`;
    case 'tactics':
      return String(tacticExampleCount(context) + 2);
    case 'puzzle':
      return String(puzzleLearnerMoves(context).length + 2);
    case 'master_game':
      return '6 to 20';
  }
}

function trapPlaybook(context: CoursePromptContext, budget: CourseBudget, skeleton: Extract<CourseSkeleton, { kind: 'trap' }> | null): string {
  const trapper = capitalise(context.learnerSide);
  const safeMove = skeleton?.safeMoveSan ?? 'not found in the dossier';
  const risk = skeleton?.trapperRiskNodeIds.length ? "\nThe trapper's setup is risky against best play (see the dossier); say so plainly." : '';
  return `KIND: TRAP
The trapper is ${trapper}. The bait is node ${skeleton?.baitNodeId ?? 'not found'}. The answer is node
${skeleton?.answerNodeId ?? 'not found'}. The victim's safe move at the bait is ${safeMove}.
Use exactly these episodes, in order:
1. hook — at most ${budget.hookWords} words, true and specific to how the trap ends:
   ${trapEnding(context)}
2. setup — the setup moves play fast. At most two speak in the video, only
   where the move order matters.
3. bait — why the victim's move looks natural. This is the heart of the trap:
   the viewer should think "I'd play that too".${baitFacts(context, skeleton)}
4. quiz — "What does ${trapper} play here?" plus a hint at the target. The
   video pauses ${budget.pauseSeconds}s (the app adds the pause).${answerWins(context, skeleton)}
5. punish — every forcing move speaks in the video; captions carry the rhythm.${victimErrors(context, skeleton)}
6. safety — how the victim stays safe: ${safeMove}, in one or two sentences.${trapperDefence(context, skeleton)}${risk}${safeLineOnBoard(context, skeleton)}
The end card and call to action are added by the app; don't write them.
In the course, every move speaks. The bait and the safe move get the longest
lines. The learner drills both sides, so the lines must teach springing the
trap and avoiding it.`;
}

const ERROR_QUALITIES = new Set(['inaccuracy', 'mistake', 'blunder', 'miss']);

/** Why the victim walks in: what the trapper's move before the bait
 * threatens, what the bait does, and what it misses (the bait's tactic
 * row). The Englund run said only "the chase looks natural". */
function baitFacts(context: CoursePromptContext, skeleton: Extract<CourseSkeleton, { kind: 'trap' }> | null): string {
  const facts = new Map(context.dossier.nodes.map((node) => [node.nodeId, node]));
  const bait = facts.get(skeleton?.baitNodeId ?? '');
  if (!bait || !skeleton) return '';
  const parentId = context.nodes.find((node) => node.id === bait.nodeId)?.parentId;
  const before = parentId ? facts.get(parentId) : undefined;
  const attacks = (before?.board ?? []).filter((fact) => /\b(attacks|forks|checks)\b/.test(fact));
  // A fork says both attacks at once.
  const forks = attacks.filter((fact) => fact.includes('forks'));
  const threats = forks.length ? forks : attacks;
  const does = bait.board.filter((fact) => !fact.startsWith('moves the '));
  const rows = [
    threats.length && parentId ? `Before it, ${nodeLabel(context, parentId)}: ${threats.join('; ')}.` : '',
    does.length ? `${nodeLabel(context, bait.nodeId)}: ${does.join('; ')}.` : '',
    bait.tactics.length ? `What it misses: ${bait.tactics.join(' ')}` : ''
  ].filter(Boolean);
  if (!rows.length) return '';
  return `\n   ${rows.join('\n   ')}\n   Say what the victim wants with the move and what they miss.`;
}

/** Where the victim goes wrong from the bait on, each with the engine's
 * best and the material after it: the Englund run called 7.Bd2 "safer"
 * when it drops a rook. */
function victimErrors(context: CoursePromptContext, skeleton: Extract<CourseSkeleton, { kind: 'trap' }> | null): string {
  if (!skeleton) return '';
  const facts = new Map(context.dossier.nodes.map((node) => [node.nodeId, node]));
  const errors = [skeleton.baitNodeId, ...skeleton.punishNodeIds].flatMap((id) => {
    const node = facts.get(id);
    if (!node || node.side === context.learnerSide || !ERROR_QUALITIES.has(node.quality)) return [];
    const best = node.bestInstead ? `; best ${node.bestInstead.san}, after which ${node.bestInstead.balance}` : '';
    return [`${nodeLabel(context, id)}: ${node.quality}${best}`];
  });
  if (!errors.length) return '';
  return `\n   The victim goes wrong at: ${errors.join(' | ')}.\n   At each, say what they hoped for; where even the best loses material, say\n   so, never "safe".`;
}

/** §13.4: the video plays the safe line (`playOut`) under the safety
 * episode's line on the bait. */
function safeLineOnBoard(context: CoursePromptContext, skeleton: Extract<CourseSkeleton, { kind: 'trap' }> | null): string {
  const line = context.dossier.nodes.find((node) => node.nodeId === skeleton?.baitNodeId)?.bestInstead?.line;
  if (!promptVideos(context).video || !line?.length) return '';
  return `\n   In the video the board goes back to before the bait and plays
   ${line.join(' ')} while this episode's video line on the bait is said:
   walk through those moves in order.`;
}

/** When the victim finds the safe move, what the trapper plays to lose as
 * little as possible: the engine's line from the bait, how it stands and
 * the material. The first strong-model run only called the setup "risky". */
function trapperDefence(context: CoursePromptContext, skeleton: Extract<CourseSkeleton, { kind: 'trap' }> | null): string {
  const bait = context.dossier.nodes.find((node) => node.nodeId === skeleton?.baitNodeId);
  const best = bait?.bestInstead;
  if (!bait || !best || best.line.length < 2) return '';
  const trapper = capitalise(context.learnerSide);
  const verdict = bait.alternatives.find((alternative) => alternative.san === best.san)?.verdict;
  const stands = [verdict, best.balance].filter(Boolean).join('; ');
  return `
   Then the trapper's side: when the victim finds ${best.san}, best play goes
   ${best.line.join(' ')}, and then ${stands}. Name ${trapper}'s best
   moves from it and say plainly how ${trapper} stands: ${TRAPPER_AIM[standingOf(verdict ?? '', trapper)]}`;
}

/** The Elephant run told the trapper to do "damage control" in a level
 * position: the aim follows the verdict. */
const TRAPPER_AIM = {
  worse: 'the aim is to lose as little as possible, not to pretend the trap still works.',
  level: 'the game goes on level, so name the plan, not damage control, and never pretend the trap still works.',
  better: 'the trapper keeps an edge even without the trap; say what it is, and never pretend the trap still works.'
} as const;

/** "White is better" for Black: worse. Anything else (roughly equal, no
 * verdict) is level. */
function standingOf(verdict: string, side: string): keyof typeof TRAPPER_AIM {
  const leader = /\b(White|Black) (?:is|has)\b/.exec(verdict)?.[1];
  if (!leader || /equal|level/i.test(verdict)) return 'level';
  return leader === side ? 'better' : 'worse';
}

/** What the trap wins, from the answer to the line's end: the moves, who
 * takes what and the material after. The Elephant run promised "Black wins
 * the queen" for a trap that wins a knight for a pawn. */
function answerWins(context: CoursePromptContext, skeleton: Extract<CourseSkeleton, { kind: 'trap' }> | null): string {
  const leafId = context.lines[0]?.leafNodeId;
  const byId = new Map(context.nodes.map((node) => [node.id, node]));
  const path = leafId ? courseNodeAncestry(byId, leafId) : [];
  const from = path.findIndex((node) => node.id === skeleton?.answerNodeId);
  if (from < 0) return '';
  const fen = (from > 0 ? path[from - 1]?.fenAfter : undefined) ?? context.startFen;
  const sans = path.slice(from).map((node) => node.san);
  const end = sans.at(-1)?.endsWith('#') ? 'it ends in checkmate' : `at the end ${lineBalance(fen, sans)}`;
  return `\n   From the answer to the end: ${sans.join(' ')}; ${captureWords(fen, sans)}; ${end}.`;
}

/** The hook's one fact, stated rather than shown by example: a quoted
 * example hook ("Their queen is gone…") was copied word for word by a local
 * model on a trap that mates. */
function trapEnding(context: CoursePromptContext): string {
  const leafId = context.lines[0]?.leafNodeId;
  const leaf = context.nodes.find((node) => node.id === leafId);
  if (!leafId || !leaf) return 'not found; say what the dossier shows.';
  if (leaf.san.endsWith('#')) return `checkmate, ${nodeLabel(context, leafId)}. Promise the mate, not material.`;
  const after = context.dossier.nodes.find((node) => node.nodeId === leafId)?.after;
  const byId = new Map(context.nodes.map((node) => [node.id, node]));
  const sans = courseNodeAncestry(byId, leafId).map((node) => node.san);
  const standing = after ? after.charAt(0).toLowerCase() + after.slice(1) : 'see the dossier';
  return `${nodeLabel(context, leafId)}, after which ${standing} and ${lineBalance(context.startFen, sans)}. Promise that material, nothing more.`;
}

function openingPlaybook(context: CoursePromptContext): string {
  const lineList = context.lines.map((line) => `${line.id} "${line.name}"`).join(', ');
  return `KIND: OPENING
The learner plays ${capitalise(context.learnerSide)}. Lines, in the creator's order: ${lineList}.
- Chapter 1 "The idea": the main line to its end. What each learner move is
  for; then the plan and the pawn structure it leads to.
- One chapter per sideline: how to recognise the deviation, the principled
  answer, and what changes in the plan.
- Each trap the dossier finds inside the lines gets its own short episode: the
  bait, the punishment, and how the learner avoids the mirror version.
- Last chapter "Recap": the move orders only, then the three takeaways.
drillNodeIds: every learner move in the main line, plus the first two learner
moves after each deviation.
In the video: chapter 1's key moves speak; each sideline in two or three
moves. The course carries the detail.`;
}

function puzzleLearnerMoves(context: CoursePromptContext): string[] {
  return context.skeleton?.kind === 'puzzle' ? context.skeleton.learnerNodeIds : [];
}

/** §13.2: a position and its solution, taught as the way to think. */
function puzzlePlaybook(context: CoursePromptContext, skeleton: Extract<CourseSkeleton, { kind: 'puzzle' }> | null): string {
  const side = capitalise(context.learnerSide);
  const task = skeleton?.mateIn ? `mate in ${skeleton.mateIn}` : 'the winning line';
  const moves = puzzleLearnerMoves(context).map((id) => nodeLabel(context, id)).join(', ') || 'not found';
  const unsound = skeleton?.unsoundNodeIds.length
    ? `\nThe engine finds another good move at ${skeleton.unsoundNodeIds.map((id) => nodeLabel(context, id)).join(', ')}: say the course's move is the one to learn, and name the other only if the dossier lists it.`
    : '';
  return `KIND: PUZZLE. ${side} to play: ${task}. The solution: ${moves}.
Use exactly these episodes, in order:
1. question — the position and the task, in one breath ("${side} to play. ${skeleton?.mateIn ? `Mate in ${skeleton.mateIn}.` : 'Find the win.'}"), and what to look at first.
2. solve — one per ${side} move, each a quiz: the checks, captures and threats
   the dossier lists here, in that order; which look right and why they fail
   (tempting moves only as the dossier gives them); then the move and why it
   works. The defender's reply: why it is forced.
3. recap — the pattern, and the cue that tells you to look for it in a game.
A strong player thinks checks, captures, threats, every move: teach that
habit, not just this answer.${unsound}`;
}

function tacticExampleCount(context: CoursePromptContext): number {
  return context.skeleton?.kind === 'tactics' && context.skeleton.examples.length ? context.skeleton.examples.length : context.lines.length;
}

function tacticsPlaybook(context: CoursePromptContext, skeleton: Extract<CourseSkeleton, { kind: 'tactics' }> | null): string {
  const found = skeleton?.examples.find((example) => example.motif)?.motif;
  const motif = found ? TACTIC_MOTIF_PHRASES[found].noun : 'tactic';
  const count = tacticExampleCount(context);
  return `KIND: TACTIC THEME (${motif}), ${count} examples, easiest first.
1. concept — one sentence on what a ${motif} is, then the cue: what on the board
   tells you to look for one. Take the cue from the examples' board facts
   (which pieces were loose, which squares they shared), not from general
   advice.
2. One episode per example: the position, the quiz (only at quiz-eligible
   nodes), the reveal, why it works, and this example's cue.
3. scan — the three things to scan for in their own games.
Each reveal names the cue again, so by the end the learner has seen the pattern
${count} times.`;
}

function masterGamePlaybook(context: CoursePromptContext): string {
  const side = capitalise(context.learnerSide);
  const { white, black, event, year } = context.headers;
  return `KIND: MASTER GAME, MOVE BY MOVE. The learner studies ${side}.
Headers: ${white ?? 'White unknown'} vs ${black ?? 'Black unknown'}, ${event ?? 'event unknown'}, ${year ?? 'year unknown'}. Use nothing about the players
beyond these headers and the creator's direction.
- intro — one sentence on what this game teaches.
- In the course, every ${side} move speaks, naming its purpose as a principle:
  development, the centre, king safety, weak squares, open files, piece
  activity, a pawn majority, the plan. Routine moves: one short sentence.
  Critical nodes: up to four sentences, including the move a club player would
  be tempted by and why it is worse (dossier alternatives only).
- Opponent moves speak only when they create a threat or change the plan.
- Guess-the-move quizzes only at critical, quiz-eligible nodes where the
  master's move is the engine's best or marked "also good".
- If the dossier marks a master's move as a mistake, say so respectfully and
  give the better move.
- In the video: the critical moments carry the story: the position, the
  question, the master's move, why.`;
}
