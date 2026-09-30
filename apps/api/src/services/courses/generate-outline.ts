import { checkCourseOutline, courseNodePath, episodeKeyMoves } from '@freechesscoach/chess-analysis';
import { buildCourseOutlineMessages, courseBudget } from '@freechesscoach/prompts';
import { CourseOutlineCallSchema, courseVideos, defaultCourseBudget, type CourseDocument, type CourseEpisode, type CourseOutline, type CourseWarning } from '@freechesscoach/shared';
import { ValidationError } from '../../lib/errors.js';
import type { CourseModelCall, GenerationInputs } from './generation-inputs.js';

/**
 * docs/courses.md §6.4: the outline call, checked in code, sent back once
 * with the problems. When the second answer still fails, the code skeleton's
 * episodes (§10) replace the model's, keeping its title, promise, hooks and
 * takeaways, and the creator gets a warning saying so.
 */
export async function planOutline(inputs: GenerationInputs, call: CourseModelCall): Promise<{ outline: CourseOutline; warnings: CourseWarning[] }> {
  const firstLabel = { step: 'outline', episodeId: null, repair: false } as const;
  const first = await call(buildCourseOutlineMessages(inputs.context), CourseOutlineCallSchema, firstLabel);
  const firstProblems = outlineProblems(inputs, first);
  await call.checked?.(firstLabel, firstProblems);
  if (firstProblems.length === 0) return { outline: withProducts(inputs, withKeyMoves(inputs, first)), warnings: [] };

  const retry = { previousOutput: JSON.stringify(first), problems: firstProblems };
  const repairLabel = { ...firstLabel, repair: true };
  const second = await call(buildCourseOutlineMessages(inputs.context, retry), CourseOutlineCallSchema, repairLabel);
  const problems = outlineProblems(inputs, second);
  await call.checked?.(repairLabel, problems);
  if (problems.length === 0) return { outline: withProducts(inputs, withKeyMoves(inputs, second)), warnings: [] };

  const plan = inputs.context.plan;
  if (!plan) throw new ValidationError(`The AI outline failed its checks twice: ${problems.join('; ')}`);
  const outline: CourseOutline = {
    ...second,
    chapters: plan.map((chapter) => ({
      title: chapter.title,
      lineId: chapter.lineId,
      episodes: chapter.episodes.map((episode) => {
        const moves = courseNodePath(inputs.context.nodes, episode.startNodeId, episode.endNodeId)?.length ?? 1;
        const budget = defaultCourseBudget(moves);
        return { ...episode, narratedNodeIds: [], budgetCourse: budget.course, budgetVideo: budget.video };
      })
    }))
  };
  const message = `The AI outline failed its checks twice, so the episodes come from the code skeleton: ${problems.join('; ')}`;
  return { outline: withProducts(inputs, withKeyMoves(inputs, outline)), warnings: [{ episodeId: null, code: 'outline', nodeId: null, message }] };
}

/** §13.3–13.4, code's say over the videos: none the course does not make,
 * and a reel on one of code's candidates in a style it allows (a promo only
 * with a video). An invalid pick falls back to the first candidate, as a
 * puzzle for a puzzle or tactics course and a highlight otherwise. */
export function withProducts(inputs: GenerationInputs, outline: CourseOutline): CourseOutline {
  const videos = courseVideos(inputs.document);
  const candidates = inputs.context.reelCandidates ?? [];
  const allowed = (style: string, styles: readonly string[]): boolean => styles.includes(style) && (style !== 'promo' || videos.video);
  let reel: CourseOutline['reel'] = null;
  if (videos.reel && candidates.length) {
    const picked = candidates.find((candidate) => candidate.id === outline.reel?.candidate);
    if (picked && outline.reel && allowed(outline.reel.style, picked.styles)) reel = outline.reel;
    else {
      const first = candidates[0]!;
      const puzzle = (inputs.document.kind === 'puzzle' || inputs.document.kind === 'tactics' || inputs.document.kind === 'endgame') && first.styles.includes('puzzle');
      reel = { candidate: first.id, style: puzzle ? 'puzzle' : 'highlight' };
    }
  }
  return { ...outline, video: videos.video ? outline.video : null, reel };
}

/** Code's say over the budgets: with no YouTube video (§13.1) the video's
 * budget is 0, and each budget is raised to fit the
 * episode's key moves (the quiz answer, a mate, a trap's bait and end),
 * which join the plan's key moves, so no budget can leave them silent. A
 * hook always has its one line: a plan that gave it 0 left the video's first
 * move silent. */
export function withKeyMoves(inputs: GenerationInputs, outline: CourseOutline): CourseOutline {
  const sans = new Map(inputs.document.nodes.map((node) => [node.id, node.san]));
  const video = courseVideos(inputs.document).video;
  return {
    ...outline,
    chapters: outline.chapters.map((chapter) => ({
      ...chapter,
      episodes: chapter.episodes.map((episode) => {
        const path = courseNodePath(inputs.document.nodes, episode.startNodeId, episode.endNodeId) ?? [];
        const keys = episodeKeyMoves({ role: episode.role, path, answerNodeId: episode.answerNodeId, sans, skeleton: inputs.skeleton });
        const least = episode.role === 'hook' ? 1 : 0;
        return {
          ...episode,
          narratedNodeIds: path.filter((id) => keys.includes(id) || episode.narratedNodeIds.includes(id)),
          budgetCourse: Math.max(episode.budgetCourse, keys.length, least),
          budgetVideo: video ? Math.max(episode.budgetVideo, keys.length, least) : 0,
          keyNodeIds: keys
        };
      })
    }))
  };
}

function outlineProblems(inputs: GenerationInputs, outline: CourseOutline): string[] {
  const { document } = inputs;
  return [...planProblems(inputs, outline), ...checkCourseOutline({
    kind: document.kind,
    outline,
    nodes: document.nodes,
    lines: document.lines,
    dossier: inputs.dossier,
    skeleton: inputs.skeleton,
    maxNarrated: courseBudget(document.kind, document.coachPersona).narratedMax
  })];
}

/** The prompt asks the model to keep code's plan; gemma-4-12b stretched the
 * master game's one-move intro over the whole game, duplicating every note. */
function planProblems(inputs: GenerationInputs, outline: CourseOutline): string[] {
  const plan = inputs.context.plan;
  if (!plan) return [];
  const written = new Map(outline.chapters.flatMap((chapter) => chapter.episodes).map((episode) => [episode.id, episode]));
  return plan.flatMap((chapter) => chapter.episodes).flatMap((planned) => {
    const episode = written.get(planned.id);
    if (!episode) return [`episode ${planned.id} (${planned.role}) from the plan is missing`];
    const problems: string[] = [];
    if (episode.role !== planned.role) problems.push(`episode ${planned.id} must have role ${planned.role}, as the plan says`);
    if (episode.startNodeId !== planned.startNodeId || episode.endNodeId !== planned.endNodeId) {
      problems.push(`episode ${planned.id} must run ${planned.startNodeId} to ${planned.endNodeId}, as the plan says (you wrote ${episode.startNodeId} to ${episode.endNodeId})`);
    }
    if ((episode.answerNodeId ?? null) !== planned.answerNodeId) problems.push(`episode ${planned.id} answerNodeId must be ${planned.answerNodeId ?? 'null'}, as the plan says`);
    return problems;
  });
}

/** The outline as the draft's chapters and (still empty) episodes. */
export function documentFromOutline(inputs: GenerationInputs, outline: CourseOutline): CourseDocument {
  return {
    ...inputs.document,
    title: outline.title,
    promise: outline.promise,
    hookOptions: outline.hookOptions,
    takeaways: outline.takeaways,
    ...(outline.video ? { video: outline.video } : {}),
    ...reelFrame(inputs, outline),
    chapters: outline.chapters.map((chapter, index) => ({
      id: `c${index + 1}`,
      title: chapter.title,
      lineId: chapter.lineId,
      episodeIds: chapter.episodes.map((episode) => episode.id)
    })),
    episodes: outline.chapters.flatMap((chapter) =>
      chapter.episodes.map(
        (episode): CourseEpisode => ({
          id: episode.id,
          role: episode.role,
          focus: episode.focus,
          startNodeId: episode.startNodeId,
          endNodeId: episode.endNodeId,
          plies: [],
          budget: { course: episode.budgetCourse, video: episode.budgetVideo, ...(episode.keyNodeIds?.length ? { keyNodeIds: episode.keyNodeIds } : {}) },
          drillNodeIds: learnerNodes(inputs, episode.startNodeId, episode.endNodeId)
        })
      )
    )
  };
}

/** The learner's own moves in the episode: its drill positions. */
export function learnerNodes(inputs: GenerationInputs, startNodeId: string, endNodeId: string): string[] {
  const sides = new Map(inputs.dossier.nodes.map((facts) => [facts.nodeId, facts.side]));
  return (courseNodePath(inputs.document.nodes, startNodeId, endNodeId) ?? []).filter((id) => sides.get(id) === inputs.document.learnerSide);
}

/** The reel's span and style from the outline's pick; the reel call writes
 * its words (§13.3). */
function reelFrame(inputs: GenerationInputs, outline: CourseOutline): Pick<CourseDocument, 'reel'> {
  const candidate = inputs.context.reelCandidates?.find((each) => each.id === outline.reel?.candidate);
  if (!candidate || !outline.reel) return {};
  const { startNodeId, climaxNodeId, endNodeId } = candidate;
  return { reel: { style: outline.reel.style, startNodeId, climaxNodeId, endNodeId, hook: '', topText: '', beats: [], payoff: '', cta: '', loop: '' } };
}
