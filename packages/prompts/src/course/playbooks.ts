import { captureWords, courseNodeAncestry, lineBalance, renderAttackTarget, renderBoardFact, TACTIC_MOTIF_PHRASES, type CourseSkeleton, type TrapSideline } from '@freechesscoach/chess-analysis';
import { capitalise } from '@freechesscoach/shared';
import type { CourseBudget } from './budget.js';
import { midSentence, nodeLabel, promptVideos, type CoursePromptContext } from './context.js';
import { trapSetupFacts } from './trap-setup.js';

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
    case 'endgame':
      return endgamePlaybook(context, context.skeleton?.kind === 'endgame' ? context.skeleton : null);
    case 'lesson':
      return lessonPlaybook(context);
  }
}

/** docs/courses.md §13.2: what the YouTube video and the reel do for this
 * kind, for the videos the course makes. */
const VIDEO_PLAYBOOK: Record<CoursePromptContext['kind'], string> = {
  trap: 'the setup, the bait and why it looks natural, the punishment, and how to stay safe; at the bait and the answer, play out the tempting moves.',
  opening: 'the plan, what each learner move is for, each sideline, each trap inside; the tempting moves where the opponent can go wrong.',
  tactics: 'the cue first, then each example with the tempting moves and why they fail.',
  puzzle: 'the thinking method: at every learner move, the checks, captures and threats in that order, which look right, why they fail, then the move.',
  master_game: 'a storytelling recap: the players (headers only), the turning points, and at each the tempting moves and why the master avoided them.',
  endgame: 'the goal and the one idea that decides it, then the technique move by move with the moves that spoil it, and each defensive try with its answer.',
  lesson: 'the idea in plain words, then each example with the tempting moves and why they fail, then the recap.'
};

const REEL_PLAYBOOK: Record<CoursePromptContext['kind'], string> = {
  trap: 'the bait and the punishment, after one breath on the opening it grows from and how the viewer got here.',
  opening: 'the one trap or idea a player of this opening must know.',
  tactics: 'the clearest example, as a puzzle.',
  puzzle: 'the position and the question ("White to play. Mate in 3." or "White to play and win."), then the solution.',
  master_game: 'the single brilliant move, blunder or finish, never a summary of the game.',
  endgame: 'one only move of the technique, as a puzzle ("White to play and win", "Black to play and draw"); with no only move, the point the technique builds to, played as a highlight.',
  lesson: 'the clearest example, as a puzzle.'
};

function productsPlaybook(context: CoursePromptContext): string {
  const videos = promptVideos(context);
  return [videos.video && `YouTube video: ${VIDEO_PLAYBOOK[context.kind]}`, videos.reel && `Reel: ${REEL_PLAYBOOK[context.kind]}`].filter(Boolean).join('\n');
}

/** Episodes the outline should have, per kind (§6.4's `{episodeRange}`). */
export function episodeRange(context: CoursePromptContext): string {
  switch (context.kind) {
    case 'trap': {
      const sidelines = context.skeleton?.kind === 'trap' ? context.skeleton.sidelines : [];
      // The hook, setup, bait, quiz, punish and safety; a defence at the bait takes safety's place.
      return String(6 + sidelines.length - (sidelines.some((sideline) => sideline.atBait && sideline.by === 'victim') ? 1 : 0));
    }
    case 'opening':
      return `one chapter per line (${context.lines.length}), plus one episode per trap and the recap`;
    case 'tactics':
    case 'lesson':
      return String(tacticExampleCount(context) + 2);
    case 'puzzle':
      return String(puzzleLearnerMoves(context).length + 2);
    case 'master_game':
      return context.lines.length > 1 ? `6 to 20, plus one variation episode per creator variation (${context.lines.length - 1})` : '6 to 20';
    case 'endgame':
      // Goal, one or two technique, a defence per sideline, the recap.
      return `${context.lines.length + 2} to ${context.lines.length + 3}`;
  }
}

function trapPlaybook(context: CoursePromptContext, budget: CourseBudget, skeleton: Extract<CourseSkeleton, { kind: 'trap' }> | null): string {
  const trapper = capitalise(context.learnerSide);
  const safeMove = skeleton?.safeMoveSan ?? 'not found in the dossier';
  const risk = skeleton?.trapperRiskNodeIds.length ? "\nThe trapper's setup is risky against best play (see the dossier); say so plainly." : '';
  // A trap whose answer ends it (Nd6#) has no punish episode in the plan.
  const punish = skeleton?.punishNodeIds.length !== 0;
  const defenceAtBait = skeleton?.sidelines.some((sideline) => sideline.atBait && sideline.by === 'victim') ?? false;
  const items = [
    `hook — at most ${budget.hookWords} words, true and specific to how the trap ends:\n   ${trapEnding(context)}${hookInVideo(context)}`,
    `setup — the setup moves play fast. At most four speak, in the video and in\n   the course, only on the moves below; the rest are silent.${trapSetupFacts(context, skeleton)}`,
    `bait — why the victim's move looks natural. This is the heart of the trap:\n   the viewer should think "I'd play that too".${baitFacts(context, skeleton)}\n   List the victim's tempting moves the dossier gives at the bait, the two a\n   real opponent would try: they are the film's side roads after the line.\n   Each side road's "why" is heard while its moves play on the board: two or\n   three whole sentences, the viewer's question, what the pieces do in order,\n   and how it leaves both sides, never clipped notes ("It advances; bishops\n   trade.").`,
    `quiz — "What does ${trapper} play here?" plus a hint at the target. The\n   video pauses ${budget.pauseSeconds}s (the app adds the pause).${answerWins(context, skeleton)}`,
    punish ? `punish — every forcing move speaks in the video; captions carry the rhythm.\n   Open on where the pieces already point ("the dark-squared bishop comes out\n   and aims at f2"). No detour here: what the victim could have played instead\n   belongs to the safety episode, after the line has run to its end.${victimErrors(context, skeleton)}` : null,
    defenceAtBait ? null : `safety — how the victim stays safe: ${safeMove}, in one or two sentences.${trapperDefence(context, skeleton)}${risk}${safeLineOnBoard(context, skeleton)}${laterExit(context, skeleton)}`,
    ...(skeleton?.sidelines ?? []).map((sideline) => sidelineItem(context, sideline))
  ].filter((item) => item !== null);
  return `KIND: TRAP
The trapper is ${trapper}. The bait is node ${skeleton?.baitNodeId ?? 'not found'}. The answer is node
${skeleton?.answerNodeId ?? 'not found'}. The victim's safe move at the bait is ${safeMove}.
Use exactly these episodes, in order:
${items.map((item, index) => `${index + 1}. ${item}`).join('\n')}
The end card is added by the app; don't write one as an episode. The coach's
spoken sign-off is the video's "outro" (see YOUTUBE VIDEO): always write it.
THE FILM'S ORDER: the main line first, the side roads after. From the bait to the
line's last move the video never leaves the line. The opponent's tempting moves
you list at the bait are played by the app after the line's last move, just
before the safety episode: so no line on the main road announces them, the
first "why" opens the side roads ("So what else could White have tried? First,
…"), and the safety episode then comes as the last and best of them ("And the
move that really works: …"). The learner's own tempting moves show in the
course only, never in the video: the learner is springing the trap and stays
on its line, so no video line mentions them.
Each stage carries one principle of good chess that its move shows (see "Teach
the principle"): the setup, the bait, the punishment and the safety, four
different ones. The bait, the answer and the safety lines use their room: the
idea, then the principle, then what to do about it in a game. A trap film that
does all this runs four minutes or more; one under three has skipped something.
Why the king has no way out is told on the mating move itself, never on the
move before it.
The setup speaks on at most 4 moves (set its budgetCourse and budgetVideo to 4
or less); from the bait on, every move speaks. The bait and the safe move get the
longest lines. The learner drills both sides, so the lines must teach springing the
trap and avoiding it.`;
}

/** The creator's own line besides the trap's: what it is for is the line's
 * creator note in the dossier. */
function sidelineItem(context: CoursePromptContext, sideline: TrapSideline): string {
  const name = context.lines.find((line) => line.id === sideline.lineId)?.name ?? sideline.lineId;
  const first = nodeLabel(context, sideline.nodeIds[0] ?? '');
  if (sideline.by === 'victim') {
    return `defence — "${name}", from ${first}${sideline.atBait ? ' (played instead of the bait: this is how the victim stays safe, so there is no separate safety episode)' : ''}: how the victim sidesteps, and what the trapper plays then.`;
  }
  return `alternative — "${name}", from ${first}: what changes when the trapper plays this instead.`;
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
  const attacks = (before?.board ?? []).filter((fact) => fact.kind === 'attacks' || fact.kind === 'forks');
  // A fork says both attacks at once.
  const forks = attacks.filter((fact) => fact.kind === 'forks');
  const threats = forks.length ? forks : attacks;
  const does = bait.board.filter((fact) => fact.kind !== 'moved').map(renderBoardFact);
  const rows = [
    threats.length && parentId ? `Before it, ${nodeLabel(context, parentId)}: ${threats.map(renderBoardFact).join('; ')}.` : '',
    does.length ? `${nodeLabel(context, bait.nodeId)}: ${does.join('; ')}.` : '',
    missed(context, skeleton)
  ].filter(Boolean);
  if (!rows.length) return '';
  return `\n   ${rows.join('\n   ')}\n   The bait's own line is the victim's side of the story, in two or three whole\n   sentences in the video: what the move attacks, what they expect to win, and\n   why any player would play it. Then name the danger they overlook only as a\n   place to look ("but nobody is watching their king"), and stop: never the\n   answer, not the move, not the piece that plays it, not what it takes, not\n   "take the pawn". The next move is the quiz; the learner finds it.`;
}

/** What the bait misses, as the trap's own line: the game review's sentence
 * on the bait read "win a pawn" in the Lasker trap, which wins the queen,
 * and "win a bishop through a checkmate — knight forks b4, f4, b2, f2 and
 * e1" in the Kieninger. */
function missed(context: CoursePromptContext, skeleton: Extract<CourseSkeleton, { kind: 'trap' }>): string {
  if (!skeleton.answerNodeId) return '';
  const leafId = context.lines[0]?.leafNodeId;
  const mates = context.nodes.find((node) => node.id === leafId)?.san.endsWith('#');
  const answer = nodeLabel(context, skeleton.answerNodeId);
  return mates ? `What it misses: ${answer}, which starts a forced mate (the quiz item has the line).` : `What it misses: ${answer}, and what it wins (the quiz item has the line and the material).`;
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
  return `\n   The victim goes wrong at: ${errors.join(' | ')}.\n   On the main road say only what they hoped for with each, in a sentence. The\n   better moves are side roads: they are told in the safety episode, never on a\n   move of the line, and least of all on its last move.`;
}

/** The video's own hook is spoken just before this episode: the second
 * Stafford film said the queen line twice in a row. */
function hookInVideo(context: CoursePromptContext): string {
  if (!promptVideos(context).video) return '';
  // The line's own name, cut to its family: on move 1 the dossier still says "King's Pawn Game".
  const family = context.dossier.lines[0]?.openingName?.split(':')[0];
  const place = family ? `"This game starts as ${family}", in the coach's words` : 'what kind of position this is, in plain words';
  return `\n   That is "text". In the video the spoken hook has just been said, so "say" never\n   repeats it: it places the viewer in one sentence: ${place}.`;
}

/** The engine's verdict on a node's best move, from its alternatives. */
function verdictOf(node: CoursePromptContext['dossier']['nodes'][number]): string {
  const verdict = node.alternatives.find((alternative) => alternative.san === node.bestInstead?.san)?.verdict;
  return verdict ? ` (${midSentence(verdict)})` : '';
}

/** The victim's later way out (the Stafford's 7.Be3 for 7.Bxd8): the safety
 * episode's second line, on that move, with its own line on the board. The
 * second film put Be3 on the mate; the fourth squeezed it into the safe
 * move's line as clipped notes. */
function laterExit(context: CoursePromptContext, skeleton: Extract<CourseSkeleton, { kind: 'trap' }> | null): string {
  const node = context.dossier.nodes.find((each) => each.nodeId === skeleton?.laterExitNodeId);
  if (!node?.bestInstead) return '';
  const board = promptVideos(context).video ? ` In the video the board goes to the position before ${nodeLabel(context, node.nodeId)} and plays ${node.bestInstead.line.join(' ')} while it is said.` : '';
  return `\n   A second line, on ${nodeLabel(context, node.nodeId)}: the later way out. One move on, the victim can
   still back out with ${node.bestInstead.san} instead: after ${node.bestInstead.line.join(' ')}, ${node.bestInstead.balance}${verdictOf(node)}.
   Open it as the question ("And if White sees it one move late?"), say what
   happens by piece in whole sentences, and how the learner stands then.${board}
   So this episode speaks on two moves (budgetCourse 2, budgetVideo 2), each line
   complete on its own; no line on the moves between.`;
}

/** §13.4: the video plays the safe line (`playOut`) under the safety
 * episode's line on the bait. */
function safeLineOnBoard(context: CoursePromptContext, skeleton: Extract<CourseSkeleton, { kind: 'trap' }> | null): string {
  const line = context.dossier.nodes.find((node) => node.nodeId === skeleton?.baitNodeId)?.bestInstead?.line;
  if (!promptVideos(context).video || !line?.length) return '';
  return `\n   In the video the board goes back to before the bait and plays
   ${line.join(' ')} while this episode's video line on the bait is said:
   say what happens in that order, by piece and in whole sentences; the board
   shows the moves, so never read them out.`;
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
  const stands = [verdict && midSentence(verdict), best.balance].filter(Boolean).join('; ');
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
  // "White is slightly better" is no reason for damage control.
  if (!leader || /equal|level|slightly/i.test(verdict)) return 'level';
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
  const leafFacts = context.dossier.nodes.find((node) => node.nodeId === leafId);
  const byId = new Map(context.nodes.map((node) => [node.id, node]));
  const sans = courseNodeAncestry(byId, leafId).map((node) => node.san);
  const standing = leafFacts ? midSentence(leafFacts.after) : 'see the dossier';
  // The Fishing Pole stops at 8…g3 with …Qh2# to come: the mate is the promise.
  if (leafFacts?.mateAhead) return `${nodeLabel(context, leafId)}, after which ${standing}. Promise the mate, not material.`;
  // Noah's Ark ends with material level and the bishop on b3 trapped.
  const trappedFact = leafFacts?.board.find((fact) => fact.kind === 'attacks' && fact.trapped);
  const trapped = trappedFact?.kind === 'attacks' ? renderAttackTarget(trappedFact) : undefined;
  if (trapped) return `${nodeLabel(context, leafId)}, after which ${standing} and ${lineBalance(context.startFen, sans)}, but ${trapped} is trapped and will be lost. Promise that piece, nothing more.`;
  // The QGA's 6.Qf3 wins the rook on a8 next move: the line stops at the attack.
  const attacks = leafFacts?.board.filter((fact) => fact.kind === 'attacks').map(renderBoardFact) ?? [];
  const threat = attacks.length ? `; ${leafFacts?.san} ${attacks.join(' and ')}` : '';
  return `${nodeLabel(context, leafId)}, after which ${standing} and ${lineBalance(context.startFen, sans)}${threat}. Promise that${threat ? ' and the threat' : ' material'}, nothing more.`;
}

function openingPlaybook(context: CoursePromptContext): string {
  const lineList = context.lines.map((line) => `${line.id} "${line.name}"`).join(', ');
  return `KIND: OPENING
The learner plays ${capitalise(context.learnerSide)}. Lines, main line first: ${lineList}.
- Chapter 1 "The idea": the main line to its end. Its first episode speaks
  on the line's first move with a placing line (the opening's name, and in a
  breath what each side is going for in the moves that follow), then on the first
  move that matters; the moves between play silently. Include that first move in
  the episode's narratedNodeIds. Then what each learner move is
  for, the plan and the pawn structure it leads to.
- One chapter per sideline: who starts the deviation (the opponent or the
  learner) and why they choose it, how to recognise it, the principled answer,
  what changes in the plan, and which line the learner should choose at their
  level and why.
- Each trap the dossier finds inside the lines gets its own short episode: the
  bait, the punishment, and how the learner avoids the mirror version.
- Last chapter "Recap": one episode on the main line's last move, with one course
  line and one video line (budgetCourse 1, budgetVideo 1): the move orders only,
  then the three takeaways. Never an episode with no line.
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
  const goal = skeleton?.goal ?? 'win';
  const task = skeleton?.mateIn ? `mate in ${skeleton.mateIn}` : goal === 'draw' ? 'save the draw' : goal === 'none' ? "the course's line" : 'the winning line';
  const ask = skeleton?.mateIn ? `Mate in ${skeleton.mateIn}.` : goal === 'draw' ? 'Find the draw.' : goal === 'none' ? 'Find the best try.' : 'Find the win.';
  // A "perpetual" the defender escapes: the line's end is still lost.
  const lastId = skeleton?.learnerNodeIds[skeleton.learnerNodeIds.length - 1];
  const end = context.dossier.nodes.find((node) => node.nodeId === lastId)?.after;
  const noGoal = goal === 'none'
    ? `\nThe engine does not rate the line's end a win or a draw for ${side} (${end ? midSentence(end) : 'no verdict'}): never call the solution winning or saving. ${end && /^The position is roughly equal/.test(end) ? 'Say what it wins, and that the engine still calls the position level.' : 'Say what it tries, and that the engine still prefers the other side.'}`
    : '';
  const moves = puzzleLearnerMoves(context).map((id) => nodeLabel(context, id)).join(', ') || 'not found';
  const unsound = skeleton?.unsoundNodeIds.length
    ? `\nThe engine finds another good move at ${skeleton.unsoundNodeIds.map((id) => nodeLabel(context, id)).join(', ')}: say the course's move is the one to learn, and name the other only if the dossier lists it.`
    : '';
  return `KIND: PUZZLE. ${side} to play: ${task}. The solution: ${moves}.${noGoal}${wrongMoves(context, skeleton?.wrongNodeIds ?? [])}
Use exactly these episodes, in order:
1. question — the position and the task, in one breath ("${side} to play. ${ask}"), and what to look at first.
2. solve — one per ${side} move, each a quiz: the checks, captures and threats
   in that order, then the move and why it works. Every check in the
   dossier's tempting moves at that move goes in its tempting list, and each
   capture there too, each with why it fails in a few words: the answer and
   what it leaves ("Ng6+? hxg6 takes the knight, and the mate is gone").
   The puzzle asks for the best move, not any move that works: where the
   dossier says "Works, but not the answer", say it works and why it is still
   not the answer ("Qd5 wins the rook, but it doesn't mate"; "it mates too,
   but in five, not four"). Tempting moves only as the dossier gives them.
   The defender's reply: why it is forced, or why the others lose faster.
3. recap — the pattern, and the cue that tells you to look for it in a game.
A strong player thinks checks, captures, threats, every move: teach that
habit, not just this answer.${unsound}`;
}

/** A solution move the engine calls an error: the course's own line is
 * wrong there, and the coach must not call it best (a puzzle's 1.Qa4+ that
 * walks into …Rxa4). The creator is warned too. */
function wrongMoves(context: CoursePromptContext, ids: readonly string[]): string {
  const facts = new Map(context.dossier.nodes.map((node) => [node.nodeId, node]));
  const rows = ids.map((id) => {
    const node = facts.get(id);
    const best = node?.bestInstead ? `; the engine's best is ${node.bestInstead.san}` : '';
    return `${nodeLabel(context, id)} is ${node ? `${/^[aeiou]/.test(node.quality) ? 'an' : 'a'} ${node.quality}` : 'an error'}${best}`;
  });
  return rows.length ? `\nThe engine disagrees with the course's line: ${rows.join('; ')}. Never call that move best or the answer; say what the engine prefers and why, from the dossier.` : '';
}

function tacticExampleCount(context: CoursePromptContext): number {
  return (context.skeleton?.kind === 'tactics' || context.skeleton?.kind === 'lesson') && context.skeleton.examples.length ? context.skeleton.examples.length : context.lines.length;
}

function tacticsPlaybook(context: CoursePromptContext, skeleton: Extract<CourseSkeleton, { kind: 'tactics' }> | null): string {
  // A mate on the back rank is the back-rank theme, not "what a checkmate is".
  const themes = [...new Set((skeleton?.examples ?? []).flatMap((example) => {
    if (!example.motif) return [];
    const backRank = example.motif === 'checkmate' && context.dossier.nodes.find((node) => node.nodeId === example.nodeId)?.board.some((fact) => fact.kind === 'backRankMate');
    return [TACTIC_MOTIF_PHRASES[backRank ? 'weakBackRank' : example.motif].noun];
  }))];
  // Examples of different ideas share no one theme: a discovered check and
  // Legal's mate read "(fork)" from the first.
  const motif = themes.length === 1 ? themes[0]! : 'tactic';
  const count = tacticExampleCount(context);
  const examples = count === 1 ? '1 example' : `${count} examples, easiest first`;
  const times = count === 1 ? 'once' : count === 2 ? 'twice' : `${count} times`;
  const theme = themes.length > 1 ? `TACTICS (${themes.join(', ')})` : `TACTIC THEME (${motif})`;
  return `KIND: ${theme}, ${examples}.
1. concept — one sentence on what a ${motif} is, then the cue: what on the board
   tells you to look for one. Take the cue from the examples' board facts
   (which pieces were loose, which squares they shared), not from general
   advice.
2. One episode per example: the position, the quiz (only at quiz-eligible
   nodes), the reveal, why it works, and this example's cue.
3. scan — the three things to scan for in their own games.
Each reveal names the cue again, so by the end the learner has seen the pattern
${times}.`;
}

/** A general lesson: any topic the creator names, from how a piece moves to a
 * pattern, taught by a few examples in a row. */
function lessonPlaybook(context: CoursePromptContext): string {
  const count = tacticExampleCount(context);
  return `KIND: LESSON, ${count === 1 ? '1 example' : `${count} examples, easiest first`}. The topic is the creator's direction; teach that and nothing wider.
1. concept — the idea in two or three plain sentences, for the course's level, and what
   to look for on the board. Use only what the examples' board facts show.
2. One episode per example: the position, the quiz (only at quiz-eligible
   nodes), the reveal, and why it works. Each example adds one thing the
   last did not.
3. recap — the idea in one breath, and one thing to practise in a real game.`;
}

/** Phase 103: a position and its technique, taught as a strong player
 * learns one: the goal, the idea, the only moves, the defender's tries. */
function endgamePlaybook(context: CoursePromptContext, skeleton: Extract<CourseSkeleton, { kind: 'endgame' }> | null): string {
  const side = capitalise(context.learnerSide);
  const mover = context.startFen.split(' ')[1] === 'b' ? 'Black' : 'White';
  const aim = skeleton ? (skeleton.goal === 'win' ? 'win' : 'hold the draw') : null;
  // The Philidor's defender is Black, but White moves first.
  const goal = !aim ? `${mover} to move` : mover === side ? `${side} to play and ${aim}` : `${mover} to move; ${side} ${aim === 'win' ? 'wins' : 'holds the draw'}`;
  const spoil = skeleton?.goal === 'draw' ? 'the draw becomes a loss' : 'the win becomes a draw';
  const list = (ids: readonly string[]): string => ids.map((id) => nodeLabel(context, id)).join(', ') || 'none';
  // The Lucena: at engine depth every rook move that keeps the pawn wins, so
  // there is no one move to ask, whatever the direction promises.
  const quizzes = skeleton && !skeleton.onlyMoveNodeIds.length
    ? 'The engine finds no only move here: other moves keep the result too. So there is no quiz, and never say only one move works, even if the direction asks for it.'
    : 'The only moves are quizzes.';
  return `KIND: ENDGAME. ${goal}. Material: ${skeleton?.material ?? 'see the dossier'}.
The technique: ${list(skeleton?.learnerNodeIds ?? [])}. The only moves: ${list(skeleton?.onlyMoveNodeIds ?? [])}.
The defender's tries: ${list(skeleton?.deviationNodeIds ?? [])}.${wrongMoves(context, skeleton?.wrongNodeIds ?? [])}
Use these episodes, in order:
1. goal — the position, the material and the goal, then the one idea that
   decides it, in plain words, from the dossier's board facts.
2. technique — the main line in one or two episodes: every ${side} move
   speaks and says what it keeps or gains. ${quizzes} Where the
   dossier gives tempting moves, say what each spoils: ${spoil}.
3. defence — one per sideline: what the defender tries and the answer.
4. recap — the rule to remember, and how to recognise the position in a game.
Name a technique (a bridge, the opposition, checking from the side) only
where the dossier's facts show it.`;
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
- variation — the creator's own variation off the game, one episode each, after
  the game: what would have happened there, and why the game went another way.
  The dossier's line note says what the creator means by it.
- In the video: the critical moments carry the story: the position, the
  question, the master's move, why.`;
}
