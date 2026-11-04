import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { courseDiagnosisCodes, renderCourseDossier, type CourseDossier, type CourseLineAnalysis } from '@freechesscoach/chess-analysis';
import { describe, expect, test } from 'vitest';
import { loadGoldenSet } from '../fixtures/courses/golden-set.js';
import { fixtureEngineFor } from './fixture-engine.js';
import { goldenDossier } from './golden-dossier.js';

const factsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'facts');
const update = process.env.GOLDEN_UPDATE === '1';

/** A course's engine facts as the dossier renders them, and Game Review's
 * notes on each line: what the import keeps and the studio writes from. */
function factsText(dossier: CourseDossier, analysis: CourseLineAnalysis[]): string {
  return [renderCourseDossier(dossier), '', 'REVIEW NOTES', ...reviewNoteLines(dossier, analysis), ''].join('\n');
}

/** What game review says about each move of each line (`CourseLineAnalysis.moves`):
 * `n12 6…Bb4: <reason>; <reason>`, moves with no note left out. */
function reviewNoteLines(dossier: CourseDossier, analysis: CourseLineAnalysis[]): string[] {
  const nodes = new Map(dossier.nodes.map((node) => [node.nodeId, node]));
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
    const { dossier, analysis } = await goldenDossier(course, fixtureEngineFor(name));
    const actual = factsText(dossier, analysis);
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

describe('golden course diagnosis codes', () => {
  test('the Englund trap trains what motifToCode gives its learner nodes: the mate (its saved bishop has no code)', async () => {
    const course = loadGoldenSet().find((each) => each.name === 'trap-englund')!;
    const { dossier, tree } = await goldenDossier(course, fixtureEngineFor(course.name));
    expect(dossier.nodes.filter((node) => node.side === dossier.learnerSide && node.motif).map((node) => `${node.san}:${node.motif}`)).toEqual(['Bb4:defendsHangingPiece', 'Bxc3:defendsHangingPiece', 'Qc1#:checkmate']);
    expect(courseDiagnosisCodes(tree, dossier)).toEqual(['TA-01']);
  });
});
