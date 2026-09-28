import type { CourseArrow, CourseDocument, CourseOutline, CourseWarning } from '@freechesscoach/shared';
import type { WrittenEpisode } from '../src/services/courses/generate-episode.js';
import type { CourseIntake } from '../src/services/courses.js';

export interface CourseRun {
  name: string;
  intake: CourseIntake;
  document: CourseDocument;
  outline: CourseOutline;
  outlineWarnings: CourseWarning[];
  episodes: WrittenEpisode[];
  calls: { outline: number; episodes: number; repairs: number };
  engineMs: number;
  totalMs: number;
}

const arrows = (list: CourseArrow[]): string => (list.length ? `  [${list.map((arrow) => `${arrow.kind} ${arrow.from}-${arrow.to}`).join(', ')}]` : '');

/** One golden course as plain text: the outline, every beat, note and quiz,
 * and what the verifier still flags after the repair call. */
export function printCourseRun(run: CourseRun): void {
  const { intake, outline } = run;
  const lines: string[] = [
    `=== ${run.name} — ${intake.coachPersona}, ${intake.levelBand}, learner ${run.document.learnerSide}`,
    `Direction: ${intake.direction}`,
    `Engine ${Math.round(run.engineMs / 1000)}s, total ${Math.round(run.totalMs / 1000)}s; calls: outline ${run.calls.outline}, episodes ${run.calls.episodes}, repairs ${run.calls.repairs}`,
    '',
    `Title: ${outline.title}`,
    `Promise: ${outline.promise}`,
    `Hooks: ${outline.hookOptions.join(' | ')}`,
    `Takeaways: ${outline.takeaways.join(' | ')}`,
    ...run.outlineWarnings.map((warning) => `OUTLINE WARNING: ${warning.message}`)
  ];

  for (const [index, chapter] of outline.chapters.entries()) {
    lines.push('', `Chapter ${index + 1} "${chapter.title}" (${chapter.lineId})`);
    for (const planned of chapter.episodes) {
      const written = run.episodes.find((episode) => episode.episode.id === planned.id);
      lines.push(`  ${planned.id} ${planned.role} ${planned.startNodeId}–${planned.endNodeId}: ${planned.focus}`);
      if (!written) continue;
      const { episode } = written;
      if (episode.budget) lines.push(`    budget: ${episode.budget.long} in the course, ${episode.budget.short} in the clip`);
      if (episode.opener) lines.push(`    opener: ${episode.opener.say}  «${episode.opener.caption}»`);
      for (const ply of episode.plies) {
        const where = [ply.long ? 'course' : null, ply.short ? 'clip' : null].filter(Boolean).join('+') || 'silent';
        lines.push(`    ${ply.nodeId} [${where}]: ${ply.text}${ply.clipText ? `  | clip: ${ply.clipText}` : ''}${ply.caption ? `  «${ply.caption}»` : ''}${arrows(ply.arrows)}`);
      }
      if (episode.quiz) {
        lines.push(`    quiz ${episode.quiz.answerNodeId}: ${episode.quiz.prompt} / hint: ${episode.quiz.hint} / reveal: ${episode.quiz.reveal}`);
      }
      lines.push(written.warnings.length ? written.warnings.map((warning) => `    ✗ ${warning.code}: ${warning.message}`).join('\n') : '    ✓ verifier: clean');
    }
  }
  console.log(`${lines.join('\n')}\n`);
}
