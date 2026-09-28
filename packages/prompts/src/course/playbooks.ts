import { TACTIC_MOTIF_PHRASES, type CourseSkeleton } from '@freechesscoach/chess-analysis';
import type { CourseBudget } from './budget.js';
import { capitalise, nodeLabel, type CoursePromptContext } from './context.js';

/** docs/courses.md §6.3, one playbook per kind, filled from the skeleton
 * (§5.5), the budget and the course. Missing facts are named as missing, so
 * no `{placeholder}` ever reaches the model. */
export function buildCoursePlaybook(context: CoursePromptContext, budget: CourseBudget): string {
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
      return '6 to 20, of which 4 to 6 are in the clip';
  }
}

function trapPlaybook(context: CoursePromptContext, budget: CourseBudget, skeleton: Extract<CourseSkeleton, { kind: 'trap' }> | null): string {
  const trapper = capitalise(context.learnerSide);
  const safeMove = skeleton?.safeMoveSan ?? 'not found in the dossier';
  const risk = skeleton?.trapperRiskNodeIds.length ? "\nThe trapper's setup is risky against best play (see the dossier); say so plainly." : '';
  return `KIND: TRAP (vertical reel, at most ${budget.seconds}s, at most ${budget.words} spoken words)
The trapper is ${trapper}. The bait is node ${skeleton?.baitNodeId ?? 'not found'}. The answer is node
${skeleton?.answerNodeId ?? 'not found'}. The victim's safe move at the bait is ${safeMove}.
Use exactly these episodes, in order:
1. hook — at most ${budget.hookWords} words, true and specific to how the trap ends:
   ${trapEnding(context)}
2. setup — the setup moves play fast. At most two speak in the clip, only
   where the move order matters.
3. bait — why the victim's move looks natural. This is the heart of the trap:
   the viewer should think "I'd play that too".
4. quiz — "What does ${trapper} play here?" plus a hint at the target. The
   clip pauses ${budget.pauseSeconds}s (the app adds the pause).
5. punish — every forcing move speaks in the clip; captions carry the rhythm.
6. safety — how the victim stays safe: ${safeMove}, in one or two sentences.${risk}
The end card and call to action are added by the app; don't write them.
In the course, every move speaks. The bait and the safe move get the longest
lines. The learner drills both sides, so the lines must teach springing the
trap and avoiding it.`;
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
  return `${nodeLabel(context, leafId)}, after which ${after ? after.charAt(0).toLowerCase() + after.slice(1) : 'see the dossier'}. Promise what that wins, nothing more.`;
}

function openingPlaybook(context: CoursePromptContext): string {
  const lineList = context.lines.map((line) => `${line.id} "${line.name}"`).join(', ');
  return `KIND: OPENING COURSE (landscape video and a chaptered course)
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
Clip: chapter 1's key moves speak; each sideline in two or three moves. The
course carries the detail.`;
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
- Clip: only the critical moments, 4–6 episodes: the position, the question,
  the master's move, why.`;
}
