import { courseFenBefore, courseGaps, moveLabel, positionWords, type CourseGap } from '@freechesscoach/chess-analysis';
import type { EngineBackend } from '../../src/services/engine/engine-backend.js';
import type { CourseIntake } from '../../src/services/courses/course-drafts.js';
import type { GenerationInputs } from '../../src/services/courses/generation-inputs.js';
import { printCourseFacts } from '../course-golden-facts.js';
import { courseInputs } from '../golden-inputs.js';
import { numbered } from './explore.js';

const ANSWER_PLIES = 6;
const REASONS: Record<CourseGap['reason'], string> = {
  checkReply: 'A WAY OUT OF YOUR CHECK WITH NO LINE',
  engineBest: "THE OPPONENT'S BEST MOVE, WHERE THE LESSON NEEDS A MISTAKE, WITH NO LINE"
};

/** The app's own dossier for an intake, before it is a course: the facts a
 * writer gets (`printCourseFacts`), then what the PGN leaves unanswered. */
export async function courseFacts(intake: CourseIntake, engine: EngineBackend, engineUrl: string): Promise<{ inputs: GenerationInputs; gaps: string[] }> {
  const inputs = await courseInputs({ intake }, engine, engineUrl);
  return { inputs, gaps: await gapLines(inputs, engine) };
}

export function printFacts(inputs: GenerationInputs, gaps: string[]): void {
  printCourseFacts(inputs.document.title, inputs);
  console.log(gaps.length ? ['', 'GAPS: moves the PGN has no line for. Add each as a variation, or write in the brief why it is left out.', ...gaps].join('\n') : '\nGAPS: none.');
}

/** Each gap with the engine's verdict and its answer, as a PGN variation. */
async function gapLines(inputs: GenerationInputs, engine: EngineBackend): Promise<string[]> {
  const gaps = courseGaps(inputs.tree, inputs.dossier);
  if (!gaps.length) return [];
  const evals = await engine.analyzeGame(gaps.map((gap) => gap.fen), { multiPv: 1, minLines: 1 });
  const byId = new Map(inputs.tree.nodes.map((node) => [node.id, node]));
  const after = (gap: CourseGap): string => {
    const node = gap.afterNodeId ? byId.get(gap.afterNodeId) : undefined;
    if (!node) return 'at the start';
    return `after ${moveLabel(courseFenBefore(byId, inputs.tree.startFen, node), node.san, '...')} (${node.id})`;
  };
  return (Object.keys(REASONS) as CourseGap['reason'][]).flatMap((reason) => {
    const rows = gaps.flatMap((gap, index) => {
      if (gap.reason !== reason) return [];
      const answer = evals[index]?.lines[0];
      const pv = (answer?.pvSan?.length ? answer.pvSan : answer ? [answer.moveSan] : []).slice(0, ANSWER_PLIES);
      return [`  ${after(gap)}: ${numbered(gap.fenBefore, [gap.san, ...pv])}  — ${positionWords(gap.fen, evals[index])}`];
    });
    return rows.length ? [`${REASONS[reason]}:`, ...rows] : [];
  });
}
