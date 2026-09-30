import { describe, expect, test } from 'vitest';
import { renderCourseDossier } from './dossier-text.js';
import { inferLearnerSide } from './learner-side.js';
import { analyseCourse, analyseEnglund, ENGLUND_TRAP, fakeEvals } from './test-fixtures.js';
import { parseCourseTree } from './tree.js';

describe('course dossier', () => {
  test('repetition counts positions, not moves', () => {
    const tree = parseCourseTree('[SetUp "1"]\n[FEN "7k/6p1/7p/8/3Q4/8/1pr2PPP/q4BK1 w - - 0 1"]\n\n1. Qd8+ Kh7 2. Qd3+ Kh8 3. Qd8+ Kh7 4. Qd3+ Kh8 5. Qd8+ *');
    const { dossier } = analyseCourse(tree, fakeEvals(tree, () => 0), 'white');
    const board = (id: string): string[] => dossier.nodes.find((node) => node.nodeId === id)?.board ?? [];
    expect(board('n1').join(' ')).not.toContain('come twice');
    expect(board('n5').join(' ')).toContain('come twice');
    expect(board('n9').join(' ')).toContain('three times');
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
