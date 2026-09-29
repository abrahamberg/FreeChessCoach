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
  /** Whose facts the text may use: `inside`, and for a hook the main line on
   * to its end too, since the hook promises how the line ends. */
  claims: Set<string>;
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
  const ahead = episode.role === 'hook' ? mainLineAfter(nodes, episode.endNodeId) : [];
  return {
    path,
    inside,
    claims: new Set([...inside, ...ahead.map((node) => node.id)]),
    playedSans: [...played, ...ahead].map((node) => node.san),
    byId,
    facts: new Map((dossier?.nodes ?? []).map((facts) => [facts.nodeId, facts])),
    fenBefore: (nodeId) => {
      const parentId = byId.get(nodeId)?.parentId;
      return (parentId ? byId.get(parentId)?.fenAfter : undefined) ?? startFen;
    }
  };
}

/** The first child, again and again: the line the tree was written with. */
function mainLineAfter(nodes: readonly CourseVerifyNode[], nodeId: string): CourseVerifyNode[] {
  const line: CourseVerifyNode[] = [];
  for (let next = nodes.find((node) => node.parentId === nodeId); next; next = nodes.find((node) => node.parentId === next!.id)) line.push(next);
  return line;
}
