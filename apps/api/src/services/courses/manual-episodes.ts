import type { CourseDossier, CourseLineGame, CourseSkeleton, TrapSideline, TrapSkeleton } from '@freechesscoach/chess-analysis';
import { courseVideos, type CourseChapter, type CourseDocument, type CourseEpisode } from '@freechesscoach/shared';
import { EpisodeBuilder, noteFocus } from './manual-notes.js';
import { openingChapters } from './manual-episodes-openings.js';
import { endgameChapters, masterGameChapters, puzzleChapters, tacticsChapters } from './manual-episodes-study.js';

export interface ManualEpisodesInput {
  document: CourseDocument;
  skeleton: CourseSkeleton;
  dossier: CourseDossier;
  lines: CourseLineGame[];
}

export interface ManualEpisodes {
  chapters: CourseChapter[];
  episodes: CourseEpisode[];
}

/** docs/courses.md §10: the skeleton becomes episodes directly, with the
 * roles of §6.3, notes pre-filled from checked facts and every clip
 * narration left empty for the creator (the role's prompt is its focus). */
export function buildManualEpisodes(input: ManualEpisodesInput): ManualEpisodes {
  const facts = new Map(input.dossier.nodes.map((node) => [node.nodeId, node]));
  const arrows = new Map(input.document.nodes.map((node) => [node.id, node.arrows]));
  const builder = new EpisodeBuilder(facts, arrows, input.skeleton, courseVideos(input.document));
  const chapters = chaptersFor(input, builder);
  return { chapters, episodes: builder.episodes };
}

function chaptersFor(input: ManualEpisodesInput, builder: EpisodeBuilder): CourseChapter[] {
  const { skeleton, lines } = input;
  const learner = input.dossier.learnerSide;
  const lineNames = new Map(input.document.lines.map((line) => [line.id, line.name]));
  const lineNotes = new Map(input.document.lines.flatMap((line) => (line.note ? [[line.id, line.note] as const] : [])));
  if (skeleton.kind === 'trap') return trapChapters(skeleton, lines, learner, lineNames, lineNotes, builder);
  if (skeleton.kind === 'tactics' || skeleton.kind === 'lesson') return tacticsChapters(skeleton, lines, builder);
  if (skeleton.kind === 'master_game') return masterGameChapters(skeleton, lines, learner, lineNames, builder);
  if (skeleton.kind === 'puzzle') return puzzleChapters(skeleton, lines, builder);
  if (skeleton.kind === 'endgame') return endgameChapters(skeleton, lines, builder);
  return openingChapters(skeleton, lines, learner, lineNames, lineNotes, builder);
}

/** A defence played instead of the bait: it takes the place of the engine's safe move. */
export const isDefenceAtBait = (sideline: TrapSideline): boolean => sideline.atBait && sideline.by === 'victim';

export const sideName = (side: 'white' | 'black'): string => (side === 'white' ? 'White' : 'Black');

function trapChapters(skeleton: TrapSkeleton, lines: CourseLineGame[], learner: 'white' | 'black', lineNames: ReadonlyMap<string, string>, lineNotes: ReadonlyMap<string, string>, builder: EpisodeBuilder): CourseChapter[] {
  const nodeIds = lines.find((line) => line.lineId === skeleton.lineId)?.nodeIds ?? [];
  const bait = nodeIds.indexOf(skeleton.baitNodeId);
  const setup = nodeIds.slice(0, bait);
  const answer = skeleton.answerNodeId;
  const learnerMoves = (ids: string[]): string[] => ids.filter((id) => builder.fact(id)?.side === learner);
  const episodeIds = [
    ...builder.add({ role: 'hook', focus: 'hook: what does the trap win, in at most 12 words?', nodeIds: nodeIds.slice(0, 1), noteNodeIds: [] }),
    ...builder.add({ role: 'setup', focus: 'setup: which move order matters?', nodeIds: setup, drillNodeIds: learnerMoves(setup) }),
    ...builder.add({ role: 'bait', focus: 'bait: why does this move look natural?', nodeIds: [skeleton.baitNodeId] }),
    ...(answer
      ? builder.add({
          role: 'quiz',
          focus: `quiz: what does ${sideName(learner)} play here?`,
          nodeIds: [answer],
          drillNodeIds: [answer],
          quiz: { answerNodeId: answer, scene: '', prompt: `${sideName(learner)} to move. Find the strongest move.`, hint: '', reveal: '' }
        })
      : []),
    ...builder.add({ role: 'punish', focus: 'punish: what does each forcing move threaten?', nodeIds: skeleton.punishNodeIds, drillNodeIds: learnerMoves(skeleton.punishNodeIds) }),
    // The creator's own defence at the bait replaces the engine's safe move.
    ...(skeleton.sidelines.some(isDefenceAtBait)
      ? []
      : builder.add({
          role: 'safety',
          focus: 'safety: how does the victim stay safe?',
          // On to the victim's later way out, where there is one: its own line, on its own board.
          nodeIds: skeleton.laterExitNodeId ? nodeIds.slice(bait, nodeIds.indexOf(skeleton.laterExitNodeId) + 1) : [skeleton.baitNodeId],
          noteNodeIds: [],
          extraNotes: skeleton.safeMoveSan ? [{ nodeId: skeleton.baitNodeId, text: `Safe instead: ${skeleton.safeMoveSan}.`, arrows: [], course: true, video: false }] : []
        }))
  ];
  const chapters: CourseChapter[] = [{ id: 'c1', title: 'The trap', lineId: skeleton.lineId, episodeIds }];
  for (const sideline of skeleton.sidelines) {
    const defence = sideline.by === 'victim';
    const ids = builder.add({
      role: defence ? 'defence' : 'alternative',
      focus: noteFocus(
        defence ? 'defence' : 'alternative',
        lineNotes.get(sideline.lineId),
        defence ? 'how the victim sidesteps, and what the trapper plays then' : 'what changes when the trapper plays this instead'
      ),
      nodeIds: sideline.nodeIds,
      drillNodeIds: defence ? learnerMoves(sideline.nodeIds) : []
    });
    chapters.push({ id: `c${chapters.length + 1}`, title: lineNames.get(sideline.lineId) ?? sideline.lineId, lineId: sideline.lineId, episodeIds: ids });
  }
  return chapters;
}
