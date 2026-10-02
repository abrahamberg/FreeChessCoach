import { describe, expect, test } from 'vitest';
import { computePositionFeatures } from '../position-features.js';
import { renderCourseDossier } from './dossier-text.js';
import { inferLearnerSide } from './learner-side.js';
import { analyseCourse, analyseEnglund, ENGLUND_TRAP, fakeEvals } from './test-fixtures.js';
import { parseCourseTree } from './tree.js';

describe('course dossier', () => {
  test('repetition counts positions, not moves', () => {
    const tree = parseCourseTree('[SetUp "1"]\n[FEN "7k/6p1/7p/8/3Q4/8/1pr2PPP/q4BK1 w - - 0 1"]\n\n1. Qd8+ Kh7 2. Qd3+ Kh8 3. Qd8+ Kh7 4. Qd3+ Kh8 5. Qd8+ *');
    const { dossier } = analyseCourse(tree, fakeEvals(tree, () => 0), 'white');
    const times = (id: string): unknown[] => (dossier.nodes.find((node) => node.nodeId === id)?.board ?? []).flatMap((fact) => (fact.kind === 'repetition' ? [fact.times] : []));
    expect(times('n1')).toEqual([]);
    expect(times('n5')).toEqual([2]);
    expect(times('n9')).toEqual([3]);
  });

  // The owner's calibration (2026-10-01): after 38…Rc1# the dossier listed
  // "Rxd2+: Black is much better" and fifteen rows of pawn structure.
  test('a move that is checkmate has no alternatives and no end-position rows', () => {
    const { dossier } = analyseEnglund();
    const mate = dossier.nodes.find((node) => node.nodeId === 'n16');
    expect(mate?.board).toContainEqual({ kind: 'gives', check: 'checkmate' });
    expect(mate?.alternatives).toEqual([]);
    expect(dossier.lines[0]?.endFeatures).toEqual([]);
    expect(dossier.nodes.find((node) => node.nodeId === 'n15')?.alternatives).not.toEqual([]);
  });

  // 35…d2 at -7.7 read "the a-file is half-open for white"; king and queen
  // against king read "open files: a, b, c, d, e, f, g, h".
  test("a decided end position lists only the winner's passed pawns", () => {
    const tree = parseCourseTree('[SetUp "1"]\n[FEN "4k3/p7/8/8/8/8/4P1PP/4K3 w - - 0 1"]\n\n1. Kd2 Kd7 *');
    const endFen = tree.nodes.at(-1)?.fenAfter ?? '';
    const passed = computePositionFeatures(endFen).passedPawns;
    const rows = (cp: number | null, mateIn: number | null): number => {
      const evals = fakeEvals(tree, () => 0);
      const end = evals.get(endFen);
      if (end) evals.set(endFen, { ...end, lines: end.lines.map((line) => ({ ...line, cp, mateIn })) });
      return analyseCourse(tree, evals, 'white').dossier.lines[0]?.endFeatures.length ?? -1;
    };
    const of = (color: 'white' | 'black'): number => passed.filter((pawn) => pawn.color === color).length;
    expect([of('white'), of('black')]).toEqual([3, 1]);
    expect(rows(500, null)).toBe(3);
    expect(rows(-500, null)).toBe(1);
    expect(rows(null, 4)).toBe(3);
    expect(rows(null, -4)).toBe(1);
    expect(rows(499, null)).toBeGreaterThan(4);
  });

  test('the rendered dossier carries verdict words and no engine numbers', () => {
    const text = renderCourseDossier(analyseEnglund().dossier);
    expect(text).toContain('Black is winning');
    expect(text).not.toMatch(/\d\.\d|[+-]\d|\bcp\b|%|centipawn/i);
  });
});

describe('the learner side, per kind', () => {
  test("a trap's is the side that plays the line's last move", () => {
    expect(inferLearnerSide('trap', parseCourseTree(ENGLUND_TRAP), null)).toBe('black');
    expect(inferLearnerSide('trap', parseCourseTree('1. e4 d5 2. exd5 *'), null)).toBe('white');
  });

  test('a puzzle or endgame is learned by the side to move; a master game by the winner; an opening asks', () => {
    const start = '[FEN "1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1"]\n\n1. Rd1+ Ke7 *';
    expect(inferLearnerSide('puzzle', parseCourseTree(start), null)).toBe('white');
    expect(inferLearnerSide('endgame', parseCourseTree(start), null)).toBe('white');
    const tree = parseCourseTree('1. e4 e5 *');
    expect(inferLearnerSide('master_game', tree, '0-1')).toBe('black');
    expect(inferLearnerSide('master_game', tree, '1/2-1/2')).toBeNull();
    expect(inferLearnerSide('opening', tree, '1-0')).toBeNull();
  });
});
