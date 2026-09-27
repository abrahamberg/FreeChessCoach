import type { CourseDossier, CourseLineGame, CourseSkeleton, TrapSkeleton } from '@freechesscoach/chess-analysis';
import type { CourseChapter, CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import { EpisodeBuilder } from './manual-notes.js';
import { openingCourseChapters, openingReelChapters } from './manual-episodes-openings.js';
import { masterGameChapters, tacticsChapters } from './manual-episodes-study.js';

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
  const builder = new EpisodeBuilder(facts, arrows);
  const chapters = chaptersFor(input, builder);
  return { chapters, episodes: builder.episodes };
}

function chaptersFor(input: ManualEpisodesInput, builder: EpisodeBuilder): CourseChapter[] {
  const { skeleton, lines } = input;
  const learner = input.dossier.learnerSide;
  if (skeleton.kind === 'trap') return trapChapters(skeleton, lines, learner, builder);
  if (skeleton.kind === 'tactics') return tacticsChapters(skeleton, lines, builder);
  if (skeleton.kind === 'master_game') return masterGameChapters(skeleton, lines, learner, builder);
  if (skeleton.kind === 'opening_reel') return openingReelChapters(skeleton, lines, learner, builder);
  const lineNames = new Map(input.document.lines.map((line) => [line.id, line.name]));
  return openingCourseChapters(skeleton, lines, learner, lineNames, builder);
}

export const sideName = (side: 'white' | 'black'): string => (side === 'white' ? 'White' : 'Black');

function trapChapters(skeleton: TrapSkeleton, lines: CourseLineGame[], learner: 'white' | 'black', builder: EpisodeBuilder): CourseChapter[] {
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
          quiz: { answerNodeId: answer, prompt: `${sideName(learner)} to move. Find the strongest move.`, hint: '', reveal: '' }
        })
      : []),
    ...builder.add({ role: 'punish', focus: 'punish: one beat per forcing move', nodeIds: skeleton.punishNodeIds, drillNodeIds: learnerMoves(skeleton.punishNodeIds) }),
    ...builder.add({
      role: 'safety',
      focus: 'safety: how does the victim stay safe?',
      nodeIds: [skeleton.baitNodeId],
      noteNodeIds: [],
      extraNotes: skeleton.safeMoveSan ? [{ nodeId: skeleton.baitNodeId, text: `Safe instead: ${skeleton.safeMoveSan}.`, arrows: [] }] : []
    })
  ];
  return [{ id: 'c1', title: 'The trap', lineId: skeleton.lineId, episodeIds }];
}
