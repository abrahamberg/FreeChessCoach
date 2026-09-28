import { courseNodeAncestry, type CourseDossier, type CourseSkeleton, type CourseTreeNode } from '@freechesscoach/chess-analysis';
import type { CoachPersona, CourseKind, CourseLine, CourseVideos, RatingBand } from '@freechesscoach/shared';
import { courseBudget } from './budget.js';
import { buildCoursePlaybook } from './playbooks.js';
import { COURSE_SHARED_BLOCK } from './shared.js';
import { buildCourseVoiceBlock } from './course-voice.js';

/** From the PGN headers; null when a header is missing or "?". */
export interface CourseHeaders {
  white: string | null;
  black: string | null;
  event: string | null;
  year: string | null;
}

/** One chapter of the episodes code would build (§10, the outline's
 * fallback), as spans the outline keeps. */
export interface CoursePlanChapter {
  title: string;
  lineId: string;
  /** `focus` is code's question for the role; not shown to the model. */
  episodes: { id: string; role: string; focus: string; startNodeId: string; endNodeId: string; answerNodeId: string | null }[];
}

/** Everything both course calls are built from. */
export interface CoursePromptContext {
  kind: CourseKind;
  persona: CoachPersona;
  learnerSide: 'white' | 'black';
  levelBand: RatingBand;
  direction: string;
  startFen: string;
  nodes: readonly Pick<CourseTreeNode, 'id' | 'parentId' | 'san' | 'fenAfter' | 'lineId'>[];
  lines: readonly CourseLine[];
  dossier: CourseDossier;
  skeleton: CourseSkeleton | null;
  /** Null when code found no skeleton; the model then plans the spans itself. */
  plan: CoursePlanChapter[] | null;
  headers: CourseHeaders;
  /** §13.1: the videos besides the course; absent means both. */
  videos?: CourseVideos;
}

export interface CourseMessages {
  system: string;
  user: string;
}

/** §6: the voice, then the shared block, then the kind playbook. Depends only on
 * the course, never on the episode, so every call of one course shares it. */
export function buildCourseSystemPrompt(context: CoursePromptContext): string {
  // The coach's voice first: every line in the course and the clip is theirs.
  return [buildCourseVoiceBlock(context.persona), COURSE_SHARED_BLOCK, buildCoursePlaybook(context, courseBudget(context.kind, context.persona))]
    .filter(Boolean)
    .join('\n\n');
}

/** The videos this course makes besides the course (§13.1). */
export function promptVideos(context: CoursePromptContext): CourseVideos {
  return context.videos ?? { video: true, reel: true };
}

export function capitalise(side: string): string {
  return side.charAt(0).toUpperCase() + side.slice(1);
}

/** "n11 (6.Bc3)", so the model sees the move beside the id. */
export function nodeLabel(context: CoursePromptContext, nodeId: string): string {
  const byId = new Map(context.nodes.map((node) => [node.id, node]));
  const node = byId.get(nodeId);
  if (!node) return nodeId;
  const fenBefore = (node.parentId ? byId.get(node.parentId)?.fenAfter : undefined) ?? context.startFen;
  return `${nodeId} (${moveText(fenBefore, node.san, true)})`;
}

/** "1. d4 e5 2. dxe5 …" from the start to the line's last node. */
export function lineMovetext(context: CoursePromptContext, leafNodeId: string): string {
  const path = courseNodeAncestry(new Map(context.nodes.map((node) => [node.id, node])), leafNodeId);
  return path
    .map((node, index) => {
      const fenBefore = index === 0 ? context.startFen : (path[index - 1]?.fenAfter ?? context.startFen);
      return moveText(fenBefore, node.san, index === 0);
    })
    .join(' ');
}

function moveText(fenBefore: string, san: string, alwaysNumber: boolean): string {
  const [, turn, , , , fullmove = '1'] = fenBefore.split(' ');
  if (turn === 'w') return `${fullmove}. ${san}`;
  return alwaysNumber ? `${fullmove}... ${san}` : san;
}
