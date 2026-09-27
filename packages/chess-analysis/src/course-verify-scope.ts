import type { CourseEpisode, CourseNode } from '@freechesscoach/shared';
import type { CourseNodeFacts } from './course-dossier-node.js';
import type { CourseDossier } from './course-dossier.js';
import { courseNodeAncestry } from './course-node-path.js';

export type CourseVerifyNode = Pick<CourseNode, 'id' | 'parentId' | 'san' | 'fenAfter'>;

/** Which nodes an episode covers and the positions around them. */
export interface EpisodeScope {
  /** Start to end, in move order. */
  path: string[];
  /** The path plus the quiz answer: where the episode may point. */
  inside: Set<string>;
  /** Every lesson move from the course start to the episode's end. */
  playedSans: string[];
  byId: Map<string, CourseVerifyNode>;
  facts: Map<string, CourseNodeFacts>;
  fenBefore: (nodeId: string) => string;
}

/** Null when the start or end is missing, or the start is not on the way to the end. */
export function episodeScope(episode: CourseEpisode, startFen: string, nodes: readonly CourseVerifyNode[], dossier: CourseDossier | null): EpisodeScope | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ancestry = courseNodeAncestry(byId, episode.endNodeId);
  const startAt = ancestry.findIndex((node) => node.id === episode.startNodeId);
  if (startAt < 0) return null;

  const path = ancestry.slice(startAt).map((node) => node.id);
  const inside = new Set(path);
  const answer = episode.quiz ? byId.get(episode.quiz.answerNodeId) : undefined;
  if (answer) inside.add(answer.id);
  const played = answer && !path.includes(answer.id) ? [...courseNodeAncestry(byId, answer.id)] : ancestry;
  return {
    path,
    inside,
    playedSans: played.map((node) => node.san),
    byId,
    facts: new Map((dossier?.nodes ?? []).map((facts) => [facts.nodeId, facts])),
    fenBefore: (nodeId) => {
      const parentId = byId.get(nodeId)?.parentId;
      return (parentId ? byId.get(parentId)?.fenAfter : undefined) ?? startFen;
    }
  };
}

/** "6.Bc3" / "6…Bb4", from the position the move was played in. */
export function moveLabel(fenBefore: string, san: string): string {
  const [, turn, , , , fullmove] = fenBefore.split(' ');
  return `${fullmove ?? '1'}${turn === 'b' ? '…' : '.'}${san}`;
}
