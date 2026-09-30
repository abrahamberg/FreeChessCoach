import { Chess } from 'chess.js';
import type { EngineEval } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { isQuizEligible } from './dossier-node.js';
import { temptingCandidates, withTempting } from './tempting.js';
import { analyseEnglund } from './test-fixtures.js';

const evaluation = (fen: string, moveSan: string, cp: number | null, mateIn: number | null = null, pvSan?: string[]): EngineEval => ({
  ply: 0,
  fen,
  depth: 20,
  lines: [{ moveSan, moveUci: '', cp, mateIn, ...(pvSan ? { pvSan } : {}) }]
});

/** The Englund's 6…Bb4 (n12): the candidates and the position before them. */
function atAnswer(kind: 'trap' | 'puzzle') {
  const { tree, dossier } = analyseEnglund();
  const candidates = temptingCandidates(tree, dossier, kind).filter((candidate) => candidate.nodeId === 'n12');
  const fen = (san: string): string => candidates.find((candidate) => candidate.san === san)!.fen;
  return { tree, dossier, candidates, fen, before: candidates[0]!.fenBefore };
}

describe('tempting moves', () => {
  test('never a mate: a mating move is the answer, not a try', () => {
    const { tree, dossier } = analyseEnglund();
    for (const kind of ['trap', 'puzzle'] as const) {
      for (const candidate of temptingCandidates(tree, dossier, kind)) expect(new Chess(candidate.fen).isCheckmate()).toBe(false);
    }
    // A trap asks nothing at its own mate; a puzzle does (the solver weighs every learner move).
    expect(temptingCandidates(tree, dossier, 'trap').some((candidate) => candidate.nodeId === 'n16')).toBe(false);
  });

  test('outside a solving move an obvious loss is dropped, and what stays says how it is answered', () => {
    const { dossier, candidates, fen, before } = atAnswer('trap');
    const evals = new Map<string, EngineEval>([
      [before, evaluation(before, 'Bb4', -1000)],
      // The knight takes the queen back: seen at a glance, not tempting.
      [fen('Qxc3+'), evaluation(fen('Qxc3+'), 'Nxc3', 150, null, ['Nxc3', 'Bb4', 'Bd2'])],
      // Still winning for Black: not tempting.
      [fen('Qxa1'), evaluation(fen('Qxa1'), 'Qd2', -900)],
      // A quiet answer that mates: the trick is deeper than a recapture.
      [fen('Nxe5'), evaluation(fen('Nxe5'), 'Qd2', null, 3, ['Qd2', 'Nxf3+', 'exf3'])]
    ]);
    const tempting = withTempting(dossier, candidates, evals).nodes.find((node) => node.nodeId === 'n12')!.tempting;
    expect(tempting.map((each) => each.san)).toEqual(['Nxe5']);
    expect(tempting[0]?.refutation).toEqual(['Qd2', 'Nxf3+', 'exf3']);
  });

  test('at a solving move every check is weighed, the obvious ones too', () => {
    const { dossier, candidates, fen, before } = atAnswer('puzzle');
    expect(candidates.every((candidate) => candidate.solving)).toBe(true);
    const evals = new Map<string, EngineEval>([
      [before, evaluation(before, 'Bb4', -1000)],
      // Obvious for a trap; a solver still wants to hear why it fails.
      [fen('Qxc3+'), evaluation(fen('Qxc3+'), 'Nxc3', 150, null, ['Nxc3', 'Bb4', 'Bd2'])],
      // As good as the course move: no tempting move.
      [fen('Qxa1'), evaluation(fen('Qxa1'), 'Qd2', -1000)]
    ]);
    const tempting = withTempting(dossier, candidates, evals).nodes.find((node) => node.nodeId === 'n12')!.tempting;
    expect(tempting.map((each) => each.san)).toContain('Qxc3+');
    expect(tempting.map((each) => each.san)).not.toContain('Qxa1');
  });
});

describe('quiz eligibility', () => {
  const line = (moveSan: string, cp: number | null, mateIn: number | null = null) => ({ moveSan, moveUci: '', cp, mateIn });
  const two = (first: ReturnType<typeof line>, second: ReturnType<typeof line>): EngineEval => ({ ply: 0, fen: '', depth: 20, lines: [first, second] });

  test('the best move by the gap is the one answer; a slower mate is no second answer, a mate as fast is', () => {
    expect(isQuizEligible(two(line('Nf7+', null, 4), line('Ng6+', 900)), 'Nf7+', 'white')).toBe(true);
    expect(isQuizEligible(two(line('Nh6+', null, 3), line('Ne5+', null, 5)), 'Nh6+', 'white')).toBe(true);
    expect(isQuizEligible(two(line('Qg8+', null, 2), line('Qf7', null, 2)), 'Qg8+', 'white')).toBe(false);
    expect(isQuizEligible(two(line('Qxa1+', -1400), line('Kd7', -900)), 'Qxa1+', 'black')).toBe(true);
    expect(isQuizEligible(two(line('Qxa1+', -1400), line('Qh1+', -1250)), 'Qxa1+', 'black')).toBe(false);
  });
});
