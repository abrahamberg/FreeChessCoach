import type { CourseLineGame, EndgameSkeleton, MasterGameSkeleton, PuzzleSkeleton, TacticsSkeleton } from '@freechesscoach/chess-analysis';
import type { CourseChapter, CourseQuiz } from '@freechesscoach/shared';
import { noteworthy, type EpisodeBuilder } from './manual-notes.js';

function findMoveQuiz(nodeId: string, side: 'white' | 'black' | undefined): CourseQuiz {
  const mover = side === 'black' ? 'Black' : 'White';
  return { answerNodeId: nodeId, prompt: `${mover} to move. Find the strongest move.`, hint: '', reveal: '' };
}

/** Phase 103 endgame: the goal; the technique, cut after each only move so
 * each piece asks one (with the reply that follows); a defence episode per
 * sideline, from where it leaves the main line; the recap. */
export function endgameChapters(skeleton: EndgameSkeleton, lines: CourseLineGame[], builder: EpisodeBuilder): CourseChapter[] {
  const main = lines.find((line) => line.lineId === skeleton.lineId)?.nodeIds ?? [];
  const first = main[0];
  if (!first) return [];
  const goal = skeleton.goal === 'win' ? 'win' : 'hold the draw';
  const episodeIds = [...builder.add({ role: 'goal', focus: `goal: how does this side ${goal}, and what one idea decides it?`, nodeIds: [first], noteNodeIds: [] })];
  let from = 0;
  const cutAfter = (index: number, quizNodeId: string | null): void => {
    const nodeIds = main.slice(from, index + 1);
    from = index + 1;
    if (!nodeIds.length) return;
    episodeIds.push(
      ...builder.add({
        role: 'technique',
        focus: 'technique: what does each move keep or gain, and which move would spoil the result?',
        nodeIds,
        drillNodeIds: nodeIds.filter((id) => skeleton.learnerNodeIds.includes(id)),
        ...(quizNodeId ? { quiz: findMoveQuiz(quizNodeId, builder.fact(quizNodeId)?.side) } : {})
      })
    );
  };
  for (const onlyMove of skeleton.onlyMoveNodeIds) {
    const at = main.indexOf(onlyMove);
    if (at >= from) cutAfter(Math.min(at + 1, main.length - 1), onlyMove);
  }
  cutAfter(main.length - 1, null);
  const chapters: CourseChapter[] = [{ id: 'c1', title: 'The technique', lineId: skeleton.lineId, episodeIds }];
  const onMain = new Set(main);
  const learner = builder.fact(skeleton.learnerNodeIds[0] ?? '')?.side;
  for (const line of lines.filter((each) => each.lineId !== skeleton.lineId)) {
    const nodeIds = line.nodeIds.filter((id) => !onMain.has(id));
    if (!nodeIds.length) continue;
    const ids = builder.add({ role: 'defence', focus: 'defence: what does the defender try here, and what is the answer?', nodeIds, drillNodeIds: nodeIds.filter((id) => builder.fact(id)?.side === learner) });
    chapters.push({ id: `c${chapters.length + 1}`, title: `The defender tries ${builder.fact(nodeIds[0]!)?.san ?? ''}`.trim(), lineId: line.lineId, episodeIds: ids });
  }
  const recap = builder.add({ role: 'recap', focus: 'recap: the rule to remember, and how to spot the position in a game', nodeIds: [main[main.length - 1]!], noteNodeIds: [] });
  chapters.push({ id: `c${chapters.length + 1}`, title: 'The rule', lineId: skeleton.lineId, episodeIds: recap });
  return chapters;
}

/** §13.2 puzzle: the question, one solve episode per learner move (asked,
 * with the defence that follows), then the recap of the pattern. */
export function puzzleChapters(skeleton: PuzzleSkeleton, lines: CourseLineGame[], builder: EpisodeBuilder): CourseChapter[] {
  const nodeIds = lines.find((line) => line.lineId === skeleton.lineId)?.nodeIds ?? [];
  const first = nodeIds[0];
  if (!first) return [];
  const question = skeleton.mateIn ? `question: mate in ${skeleton.mateIn}. What do you look at first?` : 'question: what does the position ask? What do you look at first?';
  const episodeIds = [...builder.add({ role: 'question', focus: question, nodeIds: [first], noteNodeIds: [] })];
  skeleton.learnerNodeIds.forEach((nodeId) => {
    const at = nodeIds.indexOf(nodeId);
    const reply = nodeIds[at + 1];
    const facts = builder.fact(nodeId);
    episodeIds.push(
      ...builder.add({
        role: 'solve',
        focus: 'solve: the checks, captures and threats here, which fail and why, then the move',
        nodeIds: reply && !skeleton.learnerNodeIds.includes(reply) ? [nodeId, reply] : [nodeId],
        noteNodeIds: reply && !skeleton.learnerNodeIds.includes(reply) ? [nodeId, reply] : [nodeId],
        drillNodeIds: [nodeId],
        // Every solution move is asked (§13.2), a sound one or not.
        quiz: findMoveQuiz(nodeId, facts?.side)
      })
    );
  });
  const last = nodeIds[nodeIds.length - 1]!;
  episodeIds.push(...builder.add({ role: 'recap', focus: 'recap: the pattern, and the cue to spot it in your games', nodeIds: [last], noteNodeIds: [] }));
  return [{ id: 'c1', title: 'The puzzle', lineId: skeleton.lineId, episodeIds }];
}

/** §6.3 tactics: concept, one chapter per example (easiest first, as the
 * skeleton orders them), then scan. */
export function tacticsChapters(skeleton: TacticsSkeleton, lines: CourseLineGame[], builder: EpisodeBuilder): CourseChapter[] {
  const firstLine = lines[0];
  if (!firstLine) return [];
  const conceptNode = skeleton.examples[0]?.nodeId ?? firstLine.nodeIds[0];
  const chapters: CourseChapter[] = [
    {
      id: 'c1',
      title: 'The idea',
      lineId: skeleton.examples[0]?.lineId ?? firstLine.lineId,
      episodeIds: builder.add({ role: 'concept', focus: 'concept: what it is, and the cue that tells you to look for one', nodeIds: conceptNode ? [conceptNode] : [], noteNodeIds: [] })
    }
  ];
  skeleton.examples.forEach((example, index) => {
    const nodeIds = lines.find((line) => line.lineId === example.lineId)?.nodeIds ?? [];
    const facts = builder.fact(example.nodeId);
    chapters.push({
      id: `c${chapters.length + 1}`,
      title: `Example ${index + 1}`,
      lineId: example.lineId,
      episodeIds: builder.add({
        role: 'example',
        focus: 'example: the position, the reveal, why it works, and this example’s cue',
        nodeIds: nodeIds.slice(nodeIds.indexOf(example.startNodeId)),
        noteNodeIds: [example.nodeId],
        drillNodeIds: [example.nodeId],
        ...(facts?.quizEligible ? { quiz: findMoveQuiz(example.nodeId, facts.side) } : {})
      })
    });
  });
  const lastExample = skeleton.examples[skeleton.examples.length - 1];
  const scanNode = lastExample?.nodeId ?? conceptNode;
  chapters.push({
    id: `c${chapters.length + 1}`,
    title: 'What to scan for',
    lineId: lastExample?.lineId ?? firstLine.lineId,
    episodeIds: builder.add({ role: 'scan', focus: 'scan: the three things to look for in your own games', nodeIds: scanNode ? [scanNode] : [], noteNodeIds: [] })
  });
  return chapters;
}

/** §6.3 master_game: intro and every move (notes on the learner's moves and
 * on opponent moves the facts flag), then one episode per critical moment,
 * with a guess-the-move quiz where the skeleton marks one. */
export function masterGameChapters(skeleton: MasterGameSkeleton, lines: CourseLineGame[], learner: 'white' | 'black', builder: EpisodeBuilder): CourseChapter[] {
  const line = lines[0];
  if (!line) return [];
  const quizNodes = new Set(skeleton.quizNodeIds);
  const game: CourseChapter = {
    id: 'c1',
    title: 'The game',
    lineId: line.lineId,
    episodeIds: [
      ...builder.add({ role: 'intro', focus: 'intro: what this game teaches, in one sentence', nodeIds: line.nodeIds.slice(0, 1), noteNodeIds: [] }),
      ...builder.add({ role: 'moves', focus: 'moves: the purpose of each move, as a principle', nodeIds: line.nodeIds, noteNodeIds: noteworthy(line.nodeIds, learner, builder) })
    ]
  };
  const moments = skeleton.criticalNodeIds.flatMap((nodeId) => {
    const quiz = quizNodes.has(nodeId) ? { quiz: findMoveQuiz(nodeId, builder.fact(nodeId)?.side) } : {};
    const drill = builder.fact(nodeId)?.side === learner ? [nodeId] : [];
    return builder.add({ role: 'moment', focus: 'moment: the position, the question, the move, and why', nodeIds: [nodeId], noteNodeIds: [], drillNodeIds: drill, ...quiz });
  });
  return moments.length ? [game, { id: 'c2', title: 'Critical moments', lineId: line.lineId, episodeIds: moments }] : [game];
}
