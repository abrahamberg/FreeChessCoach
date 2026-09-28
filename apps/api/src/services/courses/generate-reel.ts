import { courseLines, overusedOpeners, verifyCourseReel, type CourseVerifyProblem } from '@freechesscoach/chess-analysis';
import { buildCourseReelMessages } from '@freechesscoach/prompts';
import { courseVideos, REEL_WARNINGS, ReelScriptSchema, type CourseDocument, type CourseReel, type CourseWarning } from '@freechesscoach/shared';
import type { CourseModelCall, GenerationInputs } from './generation-inputs.js';

export interface WrittenReel {
  reel: CourseReel;
  warnings: CourseWarning[];
}

/**
 * docs/courses.md §13.3: the reel call on the span and style the outline
 * picked, the reel checks, and at most one repair. What still fails is
 * kept, as warnings for the whole course.
 */
export async function writeReel(inputs: GenerationInputs, document: CourseDocument, frame: CourseReel, call: CourseModelCall): Promise<WrittenReel> {
  const request = { context: inputs.context, title: document.title, promise: document.promise, reel: frame, videoTitle: document.video?.title ?? null, usedOpeners: overusedOpeners(courseLines({ ...document, reel: undefined })) };
  const label = { step: 'reel', episodeId: null, repair: false } as const;
  const first = await call(buildCourseReelMessages(request), ReelScriptSchema, label);
  let reel: CourseReel = { ...frame, ...first };
  let problems = verify(inputs, document, reel);
  await call.checked?.(label, problems.map((problem) => problem.message));

  if (problems.length > 0) {
    const retry = { previousOutput: JSON.stringify(first), problems: problems.map((problem) => problem.message) };
    const repairLabel = { ...label, repair: true };
    const repaired = await call(buildCourseReelMessages({ ...request, retry }), ReelScriptSchema, repairLabel);
    reel = { ...frame, ...repaired };
    problems = verify(inputs, document, reel);
    await call.checked?.(repairLabel, problems.map((problem) => problem.message));
  }
  return { reel, warnings: problems.map((problem) => ({ episodeId: REEL_WARNINGS, ...problem })) };
}

function verify(inputs: GenerationInputs, document: CourseDocument, reel: CourseReel): CourseVerifyProblem[] {
  return verifyCourseReel({ reel, startFen: document.startFen, nodes: document.nodes, dossier: inputs.dossier, direction: inputs.context.direction, hasVideo: courseVideos(document).video });
}
