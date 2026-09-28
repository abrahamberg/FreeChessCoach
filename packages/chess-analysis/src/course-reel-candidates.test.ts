import { describe, expect, test } from 'vitest';
import { courseLineGames } from './course-line-game.js';
import { reelCandidates } from './course-reel-candidates.js';
import { buildCourseSkeleton } from './course-skeleton.js';
import { analyseCourse, analyseEnglund, fakeEvals } from './course-test-fixtures.js';
import { parseCourseTree } from './course-tree.js';

describe('reel candidates (§13.3)', () => {
  test('the Englund: the mate first, then the trap’s answer, then the blunder that swings it; at most 6 moves before and 2 after', () => {
    const { tree, dossier } = analyseEnglund();
    const skeleton = buildCourseSkeleton({ kind: 'trap', tree, lines: courseLineGames(tree), dossier });
    expect(reelCandidates(tree, dossier, skeleton).map((each) => [each.id, each.reason, each.startNodeId, each.climaxNodeId, each.endNodeId, each.styles.join(' ')])).toEqual([
      ['r1', 'mate', 'n10', 'n16', 'n16', 'highlight puzzle promo'],
      ['r2', 'trap', 'n6', 'n12', 'n14', 'highlight puzzle promo'],
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
});
