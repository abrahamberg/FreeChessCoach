import { ownMoves, type CourseLineGame, type OpeningSkeleton } from '@freechesscoach/chess-analysis';
import type { CourseChapter } from '@freechesscoach/shared';
import { noteFocus, noteworthy, type EpisodeBuilder } from './manual-notes.js';

/** §6.3 opening: "The idea", a chapter per sideline (from where it
 * leaves the lines before it), a trap episode per trap, then "Recap". */
export function openingChapters(
  skeleton: OpeningSkeleton,
  lines: CourseLineGame[],
  learner: 'white' | 'black',
  lineNames: ReadonlyMap<string, string>,
  lineNotes: ReadonlyMap<string, string>,
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
        ...builder.add({ role: 'line', focus: noteFocus('line', lineNotes.get(main.lineId), 'what each learner move is for, then the plan'), nodeIds: main.nodeIds, noteNodeIds: noteworthy(main.nodeIds, learner, builder), drillNodeIds: learnerMoves(main.nodeIds) }),
        ...trapEpisodes(main)
      ]
    }
  ];
  const owned = ownMoves(lines).slice(1);
  for (const [index, line] of sidelines.entries()) {
    const own = owned[index] ?? [];
    chapters.push({
      id: `c${chapters.length + 1}`,
      title: lineNames.get(line.lineId) ?? line.lineId,
      lineId: line.lineId,
      episodeIds: [
        ...builder.add({ role: 'deviation', focus: noteFocus('deviation', lineNotes.get(line.lineId), 'how to recognise it, and the principled answer'), nodeIds: own, noteNodeIds: noteworthy(own, learner, builder), drillNodeIds: learnerMoves(own).slice(0, 2) }),
        ...trapEpisodes(line)
      ]
    });
  }
  chapters.push({ id: `c${chapters.length + 1}`, title: 'Recap', lineId: main.lineId, episodeIds: builder.add({ role: 'recap', focus: 'recap: the move orders, then the three takeaways', nodeIds: main.nodeIds.slice(-1), noteNodeIds: [] }) });
  return chapters;
}
