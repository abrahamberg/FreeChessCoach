import type { CourseLineGame, OpeningSkeleton } from '@freechesscoach/chess-analysis';
import type { CourseChapter } from '@freechesscoach/shared';
import { noteworthy, type EpisodeBuilder } from './manual-notes.js';

/** §6.3 opening_reel: hook, line, idea, remember — one chapter. */
export function openingReelChapters(skeleton: OpeningSkeleton, lines: CourseLineGame[], learner: 'white' | 'black', builder: EpisodeBuilder): CourseChapter[] {
  const line = lines[0];
  if (!line) return [];
  const last = line.nodeIds.slice(-1);
  const trap = skeleton.traps.find((candidate) => line.nodeIds.includes(candidate.blunderNodeId));
  const episodeIds = [
    ...builder.add({ role: 'hook', focus: 'hook: what does this opening give the learner?', nodeIds: line.nodeIds.slice(0, 1), noteNodeIds: [] }),
    ...builder.add({ role: 'line', focus: 'line: which moves carry the idea?', nodeIds: line.nodeIds, noteNodeIds: noteworthy(line.nodeIds, learner, builder) }),
    ...builder.add({ role: 'idea', focus: 'idea: the plan from the final position', nodeIds: last, noteNodeIds: [] }),
    ...builder.add({ role: 'remember', focus: 'remember: the one trap, mistake, pawn break or square', nodeIds: trap ? [trap.blunderNodeId, trap.answerNodeId] : last, noteNodeIds: [] })
  ];
  return [{ id: 'c1', title: 'The main line', lineId: line.lineId, episodeIds }];
}

/** §6.3 opening_course: "The idea", a chapter per sideline (from where it
 * leaves the lines before it), a trap episode per trap, then "Recap". */
export function openingCourseChapters(
  skeleton: OpeningSkeleton,
  lines: CourseLineGame[],
  learner: 'white' | 'black',
  lineNames: ReadonlyMap<string, string>,
  builder: EpisodeBuilder
): CourseChapter[] {
  const [main, ...sidelines] = lines;
  if (!main) return [];
  const learnerMoves = (ids: string[]): string[] => ids.filter((id) => builder.fact(id)?.side === learner);
  const trapEpisodes = (line: CourseLineGame): string[] =>
    skeleton.traps
      .filter((trap) => line.nodeIds.includes(trap.blunderNodeId))
      .flatMap((trap) => builder.add({ role: 'trap', focus: 'trap: the bait, the punishment, and how to avoid the mirror version', nodeIds: [trap.blunderNodeId, trap.answerNodeId] }));
  const chapters: CourseChapter[] = [
    {
      id: 'c1',
      title: 'The idea',
      lineId: main.lineId,
      episodeIds: [
        ...builder.add({ role: 'line', focus: 'line: what each learner move is for, then the plan', nodeIds: main.nodeIds, noteNodeIds: noteworthy(main.nodeIds, learner, builder), drillNodeIds: learnerMoves(main.nodeIds) }),
        ...trapEpisodes(main)
      ]
    }
  ];
  const seen = new Set(main.nodeIds);
  for (const line of sidelines) {
    const own = line.nodeIds.filter((id) => !seen.has(id));
    own.forEach((id) => seen.add(id));
    chapters.push({
      id: `c${chapters.length + 1}`,
      title: lineNames.get(line.lineId) ?? line.lineId,
      lineId: line.lineId,
      episodeIds: [
        ...builder.add({ role: 'deviation', focus: 'deviation: how to recognise it, and the principled answer', nodeIds: own, noteNodeIds: noteworthy(own, learner, builder), drillNodeIds: learnerMoves(own).slice(0, 2) }),
        ...trapEpisodes(line)
      ]
    });
  }
  chapters.push({ id: `c${chapters.length + 1}`, title: 'Recap', lineId: main.lineId, episodeIds: builder.add({ role: 'recap', focus: 'recap: the move orders, then the three takeaways', nodeIds: main.nodeIds.slice(-1), noteNodeIds: [] }) });
  return chapters;
}
