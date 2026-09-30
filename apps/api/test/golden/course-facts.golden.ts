import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCourseDossier, type CourseLineAnalysis } from '@freechesscoach/chess-analysis';
import { describe, expect, test } from 'vitest';
import { reelCandidateLines } from '../../scripts/course-golden-facts.js';
import { courseInputs } from '../../scripts/golden-inputs.js';
import type { GenerationInputs } from '../../src/services/courses/generation-inputs.js';
import { loadGoldenSet } from '../fixtures/courses/golden-set.js';
import { fixtureEngineFor } from './fixture-engine.js';

const factsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'facts');
const update = process.env.GOLDEN_UPDATE === '1';

/** The facts a course's prompts get: the dossier, reel candidates and plan. */
function factsText(inputs: GenerationInputs, analysis: CourseLineAnalysis[]): string {
  const { dossier, context } = inputs;
  const { plan } = context;
  const planLines = (plan ?? []).flatMap((chapter) => chapter.episodes.map((episode) => `  ${episode.id} ${episode.role} ${episode.startNodeId}–${episode.endNodeId}${episode.answerNodeId ? ` answer=${episode.answerNodeId}` : ''}`));
  return [renderCourseDossier(dossier), '', 'REEL CANDIDATES', ...reelCandidateLines(inputs), '', 'PLAN', ...planLines, '', 'REVIEW NOTES', ...reviewNoteLines(inputs, analysis), ''].join('\n');
}

/** What game review says about each move of each line (`CourseLineAnalysis.moves`):
 * `n12 6…Bb4: <reason>; <reason>`, moves with no note left out. */
function reviewNoteLines(inputs: GenerationInputs, analysis: CourseLineAnalysis[]): string[] {
  const nodes = new Map(inputs.dossier.nodes.map((node) => [node.nodeId, node]));
  return analysis.flatMap(({ line, moves }) => [
    `  ${line.lineId}`,
    ...moves.flatMap((move, index) => {
      const node = nodes.get(line.nodeIds[index] ?? '');
      const reasons = move.reasons ?? [];
      return node && reasons.length ? [`    ${node.nodeId} ${node.moveNumber}${node.side === 'white' ? '.' : '…'}${node.san}: ${reasons.join('; ')}`] : [];
    })
  ]);
}

describe('golden course facts', () => {
  test.each(loadGoldenSet().map((course) => [course.name, course] as const))('%s', async (name, course) => {
    const inputs = await courseInputs(course, fixtureEngineFor(name), 'fixture');
    const actual = factsText(inputs, inputs.analysis);
    const file = path.join(factsDirectory, `${name}.txt`);
    if (update) {
      mkdirSync(factsDirectory, { recursive: true });
      writeFileSync(file, actual);
      return;
    }
    const expected = existsSync(file) ? readFileSync(file, 'utf8') : '';
    expect(actual, `${name}: facts changed`).toBe(expected);
  });
});
