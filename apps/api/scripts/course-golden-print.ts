import type { CourseArrow, CourseDocument, CourseOutline, CourseWarning } from '@freechesscoach/shared';
import type { WrittenEpisode } from '../src/services/courses/generate-episode.js';
import type { WrittenReel } from '../src/services/courses/generate-reel.js';
import type { CourseIntake } from '../src/services/courses.js';

export interface CourseRun {
  name: string;
  intake: CourseIntake;
  document: CourseDocument;
  outline: CourseOutline;
  outlineWarnings: CourseWarning[];
  episodes: WrittenEpisode[];
  reel: WrittenReel | null;
  calls: { outline: number; episodes: number; reel: number; repairs: number };
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
    `Engine ${Math.round(run.engineMs / 1000)}s, total ${Math.round(run.totalMs / 1000)}s; calls: outline ${run.calls.outline}, episodes ${run.calls.episodes}, reel ${run.calls.reel}, repairs ${run.calls.repairs}`,
    '',
    `Title: ${outline.title}`,
    `Promise: ${outline.promise}`,
    `Hooks: ${outline.hookOptions.join(' | ')}`,
    `Takeaways: ${outline.takeaways.join(' | ')}`,
    ...(outline.video ? [`Video: "${outline.video.title}" [${outline.video.thumbnailText}]`, `  hook: ${outline.video.hook}`, `  outro: ${outline.video.outro}`] : []),
    ...run.outlineWarnings.map((warning) => `OUTLINE WARNING: ${warning.message}`)
  ];

  for (const [index, chapter] of outline.chapters.entries()) {
    lines.push('', `Chapter ${index + 1} "${chapter.title}" (${chapter.lineId})`);
    for (const planned of chapter.episodes) {
      const written = run.episodes.find((episode) => episode.episode.id === planned.id);
      lines.push(`  ${planned.id} ${planned.role} ${planned.startNodeId}–${planned.endNodeId}: ${planned.focus}`);
      if (!written) continue;
      const { episode } = written;
      if (episode.budget) lines.push(`    budget: ${episode.budget.course} in the course, ${episode.budget.video} in the video`);
      for (const ply of episode.plies) {
        const where = [ply.course ? 'course' : null, ply.video ? 'video' : null].filter(Boolean).join('+') || 'silent';
        lines.push(`    ${ply.nodeId} [${where}]: ${ply.text}${ply.say ? `  | video: ${ply.say}` : ''}${(ply.tempting ?? []).map((each) => `  | tempting ${each.san}: ${each.why}`).join('')}${ply.caption ? `  «${ply.caption}»` : ''}${arrows(ply.arrows)}`);
      }
      if (episode.quiz) {
        lines.push(`    quiz ${episode.quiz.answerNodeId}: ${episode.quiz.prompt} / hint: ${episode.quiz.hint} / reveal: ${episode.quiz.reveal}`);
      }
      lines.push(written.warnings.length ? written.warnings.map((warning) => `    ✗ ${warning.code}: ${warning.message}`).join('\n') : '    ✓ verifier: clean');
    }
  }
  if (run.reel) {
    const { reel, warnings } = run.reel;
    lines.push('', `Reel (${reel.style}) ${reel.startNodeId}–${reel.endNodeId}, climax ${reel.climaxNodeId}`, `  top: ${reel.topText}`, `  hook: ${reel.hook}`);
    for (const beat of reel.beats) lines.push(`  ${beat.nodeId}: ${beat.say}  «${beat.caption}»`);
    lines.push(`  payoff: ${reel.payoff}`, `  cta: ${reel.cta}`, `  loop: ${reel.loop}`);
    lines.push(warnings.length ? warnings.map((warning) => `    ✗ ${warning.code}: ${warning.message}`).join('\n') : '    ✓ reel checks: clean');
  }
  console.log(`${lines.join('\n')}\n`);
}
