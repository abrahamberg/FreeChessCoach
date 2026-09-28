import type { CourseLineGame, MasterGameSkeleton, TacticsSkeleton } from '@freechesscoach/chess-analysis';
import type { CourseChapter, CourseQuiz } from '@freechesscoach/shared';
import { noteworthy, type EpisodeBuilder } from './manual-notes.js';

function findMoveQuiz(nodeId: string, side: 'white' | 'black' | undefined): CourseQuiz {
  const mover = side === 'black' ? 'Black' : 'White';
  return { answerNodeId: nodeId, prompt: `${mover} to move. Find the strongest move.`, hint: '', reveal: '' };
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
