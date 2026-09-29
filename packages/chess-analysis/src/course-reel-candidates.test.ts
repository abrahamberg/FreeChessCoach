import { describe, expect, test } from 'vitest';
import { courseLineGames } from './course-line-game.js';
import { reelCandidates } from './course-reel-candidates.js';
import { buildCourseSkeleton } from './course-skeleton.js';
import { analyseCourse, analyseEnglund, fakeEvals } from './course-test-fixtures.js';
import { parseCourseTree } from './course-tree.js';

describe('reel candidates (§13.3)', () => {
  test('the Englund: the mate first, then the trap’s answer, then the blunder that swings it; at most 6 moves before and 2 after, or on to a mate', () => {
    const { tree, dossier } = analyseEnglund();
    const skeleton = buildCourseSkeleton({ kind: 'trap', tree, lines: courseLineGames(tree), dossier });
    expect(reelCandidates(tree, dossier, skeleton).map((each) => [each.id, each.reason, each.startNodeId, each.climaxNodeId, each.endNodeId, each.styles.join(' ')])).toEqual([
      ['r1', 'mate', 'n10', 'n16', 'n16', 'highlight puzzle promo'],
      // The trap's answer runs on to the mate, 4 moves later: the payoff.
      ['r2', 'trap', 'n6', 'n12', 'n16', 'highlight puzzle promo'],
      // The blunder is not the move to find, so it is no puzzle.
      ['r3', 'swing', 'n5', 'n11', 'n13', 'highlight promo']
    ]);
  });

  test('a puzzle: its solution from the starting position', () => {
    const tree = parseCourseTree('[SetUp "1"]\n[FEN "r6k/6pp/7N/8/8/1Q6/6PP/6K1 w - - 0 1"]\n\n1. Qg8+ Rxg8 2. Nf7# *');
    const { dossier } = analyseCourse(tree, fakeEvals(tree, () => 2000), 'white');
    const skeleton = buildCourseSkeleton({ kind: 'puzzle', tree, lines: courseLineGames(tree), dossier });
    expect(reelCandidates(tree, dossier, skeleton)[0]).toMatchObject({ reason: 'puzzle', startNodeId: 'n1', climaxNodeId: 'n3', endNodeId: 'n3' });
  });

  test("an endgame with no only move: the technique's last move, played, never asked (the Lucena's Rb4: Kc6 wins too)", () => {
    const tree = parseCourseTree('[FEN "1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1"]\n\n1. Rd1+ Ke7 (1... Kc6 2. Kc8) 2. Rd4 Ra1 3. Kc7 Rc1+ 4. Kb6 Rb1+ 5. Kc6 Rc1+ 6. Kb5 Rb1+ 7. Rb4 *');
    const { dossier } = analyseCourse(tree, fakeEvals(tree, () => 2000), 'white');
    const skeleton = buildCourseSkeleton({ kind: 'endgame', tree, lines: courseLineGames(tree), dossier });
    expect(reelCandidates(tree, dossier, skeleton)[0]).toMatchObject({ reason: 'technique', startNodeId: 'n7', climaxNodeId: 'n13', endNodeId: 'n13', styles: ['highlight', 'promo'] });
  });

  test('an endgame with only moves: the last one as a puzzle, the moves before it leading in', () => {
    const tree = parseCourseTree('[FEN "1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1"]\n\n1. Rd1+ Ke7 (1... Kc6 2. Kc8) 2. Rd4 Ra1 3. Kc7 Rc1+ 4. Kb6 Rb1+ 5. Kc6 Rc1+ 6. Kb5 Rb1+ 7. Rb4 *');
    const analysed = analyseCourse(tree, fakeEvals(tree, () => 2000), 'white').dossier;
    const dossier = { ...analysed, nodes: analysed.nodes.map((node) => ({ ...node, quizEligible: node.nodeId === 'n7' })) };
    const skeleton = buildCourseSkeleton({ kind: 'endgame', tree, lines: courseLineGames(tree), dossier });
    expect(reelCandidates(tree, dossier, skeleton)[0]).toMatchObject({ reason: 'puzzle', startNodeId: 'n1', climaxNodeId: 'n7', endNodeId: 'n9', styles: ['highlight', 'puzzle', 'promo'] });
  });

  test('a book line with no blunder: the one clear move with a threat in it, as an idea', () => {
    const tree = parseCourseTree('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 *');
    const { dossier } = analyseCourse(tree, fakeEvals(tree, () => 20), 'black');
    const quiz = new Set(['n13']);
    const marked = { ...dossier, nodes: dossier.nodes.map((node) => ({ ...node, quizEligible: quiz.has(node.nodeId) })) };
    const skeleton = buildCourseSkeleton({ kind: 'opening', tree, lines: courseLineGames(tree), dossier: marked });
    expect(reelCandidates(tree, marked, skeleton).map((each) => [each.reason, each.climaxNodeId])).toEqual([['idea', 'n13']]);
  });
});
