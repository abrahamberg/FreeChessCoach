import type { EngineEval } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { rateCourseNodes } from './rate-nodes.js';
import { parseCourseTree } from './tree.js';

const line = (move: string, san: string, cp: number) => ({ moveUci: move, moveSan: san, cp, mateIn: null });
const evalAt = (fen: string, lines: ReturnType<typeof line>[]): EngineEval => ({ ply: 0, fen, depth: 12, lines });

describe('rateCourseNodes', () => {
  test('rates each move from the lines before and after it, without a dossier', () => {
    const tree = parseCourseTree('1. e4 e5 2. Qh5 *');
    const fens = [tree.startFen, ...tree.nodes.map((node) => node.fenAfter)];
    const [start, afterE4, afterE5, afterQh5] = fens as [string, string, string, string];
    const evals = new Map([
      [start, evalAt(start, [line('e2e4', 'e4', 30), line('d2d4', 'd4', 25)])],
      [afterE4, evalAt(afterE4, [line('e7e5', 'e5', 30), line('c7c5', 'c5', 28)])],
      [afterE5, evalAt(afterE5, [line('g1f3', 'Nf3', 30), line('f1c4', 'Bc4', 28)])],
      [afterQh5, evalAt(afterQh5, [line('b8c6', 'Nc6', -20), line('g8f6', 'Nf6', -25)])]
    ]);
    const rated = rateCourseNodes(tree, 'white', evals);
    expect(Object.keys(rated)).toEqual(['n1', 'n2', 'n3']);
    expect(rated.n1).toMatchObject({ san: 'e4', cp: 30, quality: 'best' });
    // White's figure, as the engine gives it, whoever moved.
    expect(rated.n3?.cp).toBe(-20);
  });
});
