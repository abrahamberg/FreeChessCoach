import { describe, expect, test, vi } from 'vitest';
import { Chess } from 'chess.js';
import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { EngineEval } from '@freechesscoach/shared';
import type { EngineBackend } from './engine/engine-backend.js';
import { buildCourseDossierFromEngine } from './course-dossier.js';

/** Every position: its first two legal moves, level. */
function fakeAnalyzeGame(fens: string[]): Promise<EngineEval[]> {
  return Promise.resolve(
    fens.map((fen, ply) => ({
      ply,
      fen,
      depth: 20,
      lines: new Chess(fen)
        .moves({ verbose: true })
        .slice(0, 2)
        .map((move) => ({ moveSan: move.san, moveUci: `${move.from}${move.to}`, cp: 0, mateIn: null }))
    }))
  );
}

describe('buildCourseDossierFromEngine', () => {
  test('evaluates each distinct position once, multiPv 3, and gives facts for every node', async () => {
    const analyzeGame = vi.fn<EngineBackend['analyzeGame']>(fakeAnalyzeGame);
    const tree = parseCourseTree('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *');

    const { dossier, lines } = await buildCourseDossierFromEngine(tree, 'white', { analyzeGame });

    expect(analyzeGame).toHaveBeenCalledTimes(1);
    const [fens, options] = analyzeGame.mock.calls[0] ?? [];
    expect(fens).toHaveLength(6);
    expect(new Set(fens).size).toBe(6);
    expect(options).toMatchObject({ multiPv: 3 });
    expect(dossier.nodes.map((node) => node.nodeId)).toEqual(tree.nodes.map((node) => node.id));
    expect(dossier.nodes.find((node) => node.nodeId === 'n1')?.inBook).toBe(true);
    expect(lines.map((analysis) => analysis.line.lineId)).toEqual(['l1', 'l2']);
  });
});
