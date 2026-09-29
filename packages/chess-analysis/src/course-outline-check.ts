import { COURSE_ROLES, type CourseKind, type CourseLine, type CourseOutline, type CourseOutlineEpisode } from '@freechesscoach/shared';
import type { CourseDossier } from './course-dossier.js';
import { courseNodeAncestry, courseNodePath, type CoursePathNode } from './course-node-path.js';
import type { CourseSkeleton } from './course-skeleton.js';

/** Roles that go back over the line (a recap, a scan, the trap's safe move
 * at the bait), so they may start before the episode before them. */
const OVERVIEW_ROLES = new Set(['recap', 'scan', 'safety', 'goal']);
const MASTER_QUIZ_QUALITIES = new Set(['brilliant', 'great', 'best', 'excellent']);
const NEAREST_ELIGIBLE = 2;
const MAX_LISTED_NODES = 8;

export interface CourseOutlineCheckInput {
  kind: CourseKind;
  outline: CourseOutline;
  nodes: readonly CoursePathNode[];
  lines: readonly CourseLine[];
  dossier: CourseDossier;
  skeleton: CourseSkeleton | null;
  /** How many nodes the video may narrate in all. */
  maxNarrated: number;
}

/**
 * docs/courses.md §6.4: everything code checks in an outline before any
 * episode is written. Each problem is a sentence for the model's retry
 * ("episode e4 answerNodeId n17 is not quiz-eligible; eligible nodes near
 * it: n15, n19"). Empty when the outline is sound.
 */
export function checkCourseOutline(input: CourseOutlineCheckInput): string[] {
  const { outline } = input;
  const byId = new Map(input.nodes.map((node) => [node.id, node]));
  const problems: string[] = [];
  const seen = new Set<string>();
  const covered = new Set<string>();

  outline.chapters.forEach((chapter, index) => {
    const line = input.lines.find((candidate) => candidate.id === chapter.lineId);
    if (!line) problems.push(`chapter ${index + 1} lineId ${chapter.lineId} does not exist`);
    const lineIds = line ? courseNodeAncestry(byId, line.leafNodeId).map((node) => node.id) : [];
    let lastStart = -1;
    for (const episode of chapter.episodes) {
      if (seen.has(episode.id)) problems.push(`episode id ${episode.id} is used twice`);
      seen.add(episode.id);
      const path = episodeProblems(input, byId, episode, problems);
      if (!path) continue;
      for (const nodeId of path) covered.add(nodeId);
      if (episode.answerNodeId) covered.add(episode.answerNodeId);
      if (!line) continue;
      const outside = path.find((nodeId) => !lineIds.includes(nodeId));
      if (outside) problems.push(`episode ${episode.id} leaves line ${line.id} at ${outside}`);
      const start = lineIds.indexOf(episode.startNodeId);
      if (start >= 0 && start < lastStart && !OVERVIEW_ROLES.has(episode.role)) problems.push(`episode ${episode.id} starts before the episode before it on line ${line.id}`);
      if (start >= 0 && !OVERVIEW_ROLES.has(episode.role)) lastStart = Math.max(lastStart, start);
    }
  });

  problems.push(...coverageProblems(input, covered));
  const narrated = outline.chapters.flatMap((chapter) => chapter.episodes).reduce((sum, episode) => sum + episode.narratedNodeIds.length, 0);
  if (narrated > input.maxNarrated) problems.push(`the outline narrates ${narrated} nodes; the budget allows ${input.maxNarrated}`);
  return problems;
}

/** The episode's own checks; its path from start to end, or null when it has none. */
function episodeProblems(input: CourseOutlineCheckInput, byId: ReadonlyMap<string, CoursePathNode>, episode: CourseOutlineEpisode, problems: string[]): string[] | null {
  const roles = COURSE_ROLES[input.kind];
  if (!roles.includes(episode.role)) problems.push(`episode ${episode.id} role "${episode.role}" is not one of ${roles.join(', ')}`);
  const missing = [episode.startNodeId, episode.endNodeId, ...episode.narratedNodeIds, ...(episode.answerNodeId ? [episode.answerNodeId] : [])].filter((id) => !byId.has(id));
  if (missing.length) {
    problems.push(`episode ${episode.id} names ${missing.join(', ')}, which do not exist`);
    return null;
  }
  const path = courseNodePath(input.nodes, episode.startNodeId, episode.endNodeId);
  if (!path) {
    problems.push(`episode ${episode.id} runs from ${episode.startNodeId} to ${episode.endNodeId}, which is not one line`);
    return null;
  }
  if (episode.budgetCourse > path.length || episode.budgetVideo > path.length) {
    problems.push(`episode ${episode.id} lets ${Math.max(episode.budgetCourse, episode.budgetVideo)} moves speak but has ${path.length}`);
  }
  const strays = episode.narratedNodeIds.filter((id) => !path.includes(id));
  if (strays.length) problems.push(`episode ${episode.id} narrates ${strays.join(', ')}, outside ${episode.startNodeId}–${episode.endNodeId}`);
  if (episode.answerNodeId && !isQuizAnswerEligible(input.kind, input.dossier, episode.answerNodeId)) {
    const near = nearestEligible(input, episode.answerNodeId);
    problems.push(
      `episode ${episode.id} answerNodeId ${episode.answerNodeId} is not quiz-eligible; ${near.length ? `eligible nodes near it: ${near.join(', ')}` : 'no node is eligible, so drop the quiz'}`
    );
  }
  return path;
}

/** A quiz may sit on this node (§6.4); code's plan uses the same rule, so
 * the plan never fails the outline check. */
export function isQuizAnswerEligible(kind: CourseKind, dossier: CourseDossier, nodeId: string): boolean {
  const facts = dossier.nodes.find((node) => node.nodeId === nodeId);
  if (!facts) return false;
  if (kind === 'master_game') return facts.critical && (facts.quizEligible || MASTER_QUIZ_QUALITIES.has(facts.quality));
  // A puzzle asks every solution move (§13.2); a second good answer is
  // accepted by the player's engine check, and the checks warn about it.
  if (kind === 'puzzle') return facts.side === dossier.learnerSide;
  return facts.quizEligible;
}

function nearestEligible(input: CourseOutlineCheckInput, nodeId: string): string[] {
  const number = (id: string): number => Number(id.slice(1));
  return input.dossier.nodes
    .filter((node) => isQuizAnswerEligible(input.kind, input.dossier, node.nodeId))
    .map((node) => node.nodeId)
    .sort((a, b) => Math.abs(number(a) - number(nodeId)) - Math.abs(number(b) - number(nodeId)) || number(a) - number(b))
    .slice(0, NEAREST_ELIGIBLE)
    .sort((a, b) => number(a) - number(b));
}

/** Nodes the kind cannot do without: the trap's bait, answer and a safety
 * episode; every move of a master game. */
function coverageProblems(input: CourseOutlineCheckInput, covered: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const skeleton = input.skeleton;
  if (input.kind === 'trap' && skeleton?.kind === 'trap') {
    if (!covered.has(skeleton.baitNodeId)) problems.push(`no episode covers the bait ${skeleton.baitNodeId}`);
    if (skeleton.answerNodeId && !covered.has(skeleton.answerNodeId)) problems.push(`no episode covers the answer ${skeleton.answerNodeId}`);
  }
  const roles = new Set(input.outline.chapters.flatMap((chapter) => chapter.episodes.map((episode) => episode.role)));
  if (input.kind === 'trap' && !roles.has('safety')) problems.push('there is no safety episode');
  if (input.kind === 'endgame' && skeleton?.kind === 'endgame') {
    const uncovered = skeleton.learnerNodeIds.filter((id) => !covered.has(id));
    if (uncovered.length) problems.push(`every move of the technique needs an episode; ${uncovered.slice(0, MAX_LISTED_NODES).join(', ')} are in none`);
  }
  if (input.kind === 'master_game') {
    const uncovered = input.nodes.map((node) => node.id).filter((id) => !covered.has(id));
    if (uncovered.length) {
      const listed = uncovered.slice(0, MAX_LISTED_NODES).join(', ');
      problems.push(`every move needs an episode; ${uncovered.length} are in none: ${listed}${uncovered.length > MAX_LISTED_NODES ? ', …' : ''}`);
    }
  }
  return problems;
}
