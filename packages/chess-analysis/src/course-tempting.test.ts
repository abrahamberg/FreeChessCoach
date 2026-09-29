import type { EngineEval } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { analyseEnglund } from './course-test-fixtures.js';
import { temptingCandidates, withTempting } from './course-tempting.js';

const evaluation = (fen: string, moveSan: string, cp: number | null, mateIn: number | null = null, pvSan?: string[]): EngineEval => ({
  ply: 0,
  fen,
  depth: 20,
  lines: [{ moveSan, moveUci: '', cp, mateIn, ...(pvSan ? { pvSan } : {}) }]
});

describe('tempting moves (§13.5)', () => {
  test('candidates: checks, then captures by value taken, then threats; never the move played or a ranked one', () => {
    const { tree, dossier } = analyseEnglund();
    const candidates = temptingCandidates(tree, dossier, 'trap');
    // 6…Bb4, the answer: Black's checks and captures, the rook before the knight.
    expect(candidates.filter((candidate) => candidate.nodeId === 'n12').map((candidate) => [candidate.san, candidate.kind])).toEqual([
      ['Qxc3+', 'check'],
      ['Qxa1', 'capture'],
      ['Qxb1', 'capture'],
      ['Nxe5', 'capture'],
      ['Qxc2', 'capture'],
      ['Qxa2', 'capture']
    ]);
    // 6.Bc3, the bait: the engine's Nc3 is ranked, so it is not a candidate; a retreat that hits the queen is a threat.
    expect(candidates.filter((candidate) => candidate.nodeId === 'n11').map((candidate) => candidate.san)).toEqual(['Bc1', 'Qc1', 'Ba5']);
    // A move that is not critical or a quiz answer is not looked at (no learner-move sweep for a trap).
    expect(candidates.some((candidate) => candidate.nodeId === 'n2')).toBe(false);
  });

  test('kept when the engine says they fail (15 win% or walking into mate) and it is not obvious, at most 3, with the answer', () => {
    const { tree, dossier } = analyseEnglund();
    const candidates = temptingCandidates(tree, dossier, 'trap').filter((candidate) => candidate.nodeId === 'n12');
    const at = (san: string): string => candidates.find((candidate) => candidate.san === san)!.fen;
    const before = candidates[0]!.fenBefore;
    const evals = new Map<string, EngineEval>([
      [before, evaluation(before, 'Bb4', -1000)],
      // The knight takes the queen back: seen at a glance, so not tempting.
      [at('Qxc3+'), evaluation(at('Qxc3+'), 'Nxc3', 150, null, ['Nxc3', 'Bb4', 'Bd2'])],
      // Still winning for Black: not tempting.
      [at('Qxa1'), evaluation(at('Qxa1'), 'Qd2', -900)],
      [at('Qxb1'), evaluation(at('Qxb1'), 'Qxb1', 200)],
      // A quiet answer that mates: the trick is deeper than a recapture.
      [at('Nxe5'), evaluation(at('Nxe5'), 'Qd2', null, 3, ['Qd2', 'Nxf3+', 'exf3'])],
      [at('Qxc2'), evaluation(at('Qxc2'), 'Qxc2', 300)]
    ]);

    const tempting = withTempting(dossier, candidates, evals).nodes.find((node) => node.nodeId === 'n12')!.tempting;

    expect(tempting.map((each) => [each.san, each.kind, each.refutation])).toEqual([['Nxe5', 'capture', ['Qd2', 'Nxf3+', 'exf3']]]);
    const [nxe5] = tempting;
    expect(nxe5?.does).toContain('captures the pawn on e5');
    expect(nxe5?.captures).toBe('Black takes a knight and a pawn; White takes a knight');
    expect(nxe5?.verdict).toMatch(/mate/i);
  });

  test('a puzzle looks at every learner move', () => {
    const { tree, dossier } = analyseEnglund();
    const learnerMoves = dossier.nodes.filter((node) => node.side === 'black').map((node) => node.nodeId);
    const asked = new Set(temptingCandidates(tree, dossier, 'puzzle').map((candidate) => candidate.nodeId));
    expect([...asked].every((id) => learnerMoves.includes(id) || dossier.nodes.find((node) => node.nodeId === id)?.critical)).toBe(true);
    // Beyond the trap's critical moves: an ordinary learner move is looked at too.
    const ordinary = [...asked].filter((id) => !dossier.nodes.find((node) => node.nodeId === id)?.critical);
    expect(ordinary.length).toBeGreaterThan(0);
    expect(temptingCandidates(tree, dossier, 'trap').some((candidate) => ordinary.includes(candidate.nodeId))).toBe(false);
  });
});
