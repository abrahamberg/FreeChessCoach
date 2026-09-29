import { describe, expect, test } from 'vitest';
import { renderCourseDossier } from './course-dossier-text.js';
import { abandonedGuard, boardFacts } from './course-dossier-words.js';
import { endgameShapeProblems, inferLearnerSide, puzzleShapeProblems } from './course-learner-side.js';
import { courseLineGames } from './course-line-game.js';
import { buildCourseSkeleton } from './course-skeleton.js';
import { analyseCourse, analyseEnglund, ENGLUND_TRAP, fakeEvals, type FakeEval } from './course-test-fixtures.js';
import { parseCourseTree, type CourseTree } from './course-tree.js';

const englund = analyseEnglund;

const byId = (tree: CourseTree) => new Map(tree.nodes.map((node) => [node.id, node]));

describe('course dossier', () => {
  test('each line runs as a game from the tree start, with a PGN of its own', () => {
    const tree = parseCourseTree('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *');
    const [main, sideline] = courseLineGames(tree);

    expect(main?.nodeIds).toEqual(['n1', 'n2', 'n3']);
    expect(sideline?.nodeIds).toEqual(['n1', 'n4', 'n5']);
    expect(sideline?.game.positions.map((position) => position.moveSan)).toEqual([null, 'e4', 'c5', 'Nf3']);
    expect(sideline?.pgn).toContain('1. e4 c5 2. Nf3');
  });

  test('Englund trap: facts per node, in words', () => {
    const { dossier } = englund();
    const facts = new Map(dossier.nodes.map((node) => [node.nodeId, node]));
    const bait = facts.get('n11');

    expect(bait?.san).toBe('Bc3');
    expect(bait?.moveNumber).toBe(6);
    expect(bait?.side).toBe('white');
    expect(bait?.board).toContain('attacks the queen on b2');
    expect(bait?.bestInstead?.san).toBe('Nc3');
    expect(bait?.after).toBe('Black is winning');
    expect(facts.get('n12')?.quizEligible).toBe(true);
    expect(facts.get('n12')?.evalAfterCp).toEqual(expect.any(Number));
    expect(facts.get('n12')?.board).toEqual(['moves the bishop from f8 to b4', 'attacks the bishop on c3, which is pinned to the king']);
    expect(facts.get('n5')?.quizEligible).toBe(false);
    expect(facts.get('n16')?.after).toBe('checkmate');
    expect(facts.get('n16')?.board).toContain('gives checkmate');
    // A piece the checking piece "attacks" is not pinned by it: the king is
    // attacked already (4...Qb4+ and 8...Qc1#). 7...Bxc3+ does pin the queen.
    expect(facts.get('n8')?.board).toContain('attacks the bishop on f4');
    expect(facts.get('n16')?.board).toContain('attacks the knight on b1');
    expect(facts.get('n14')?.board).toContain('attacks the queen on d2, which is pinned to the king');
    // What the model must not guess: how a check is met, why the safe move
    // works, and forks by piece, not by square.
    expect(facts.get('n8')?.board).toContain('the check can be answered: block with Bd2, Nfd2, c3, Nc3, Nbd2, Qd2; the checking piece cannot be taken; the king cannot move');
    // No "keeps the rook safe": after 6.Bc3 the rook was never truly loose (…Qxa1 Bxa1).
    expect(bait?.bestInstead?.board).toEqual(['moves the knight from b1 to c3']);
    expect(facts.get('n7')?.board).toEqual(['moves the bishop from c1 to f4']);
    expect(facts.get('n16')?.board).toContain('a back-rank mate');
    expect(facts.get('n16')?.board).toContain('why it is mate: the king on e1 is checked by the queen on c1; e2, f1, f2 hold its own pieces; d1 and d2 are covered by the queen on c1');
    expect(facts.get('n10')?.board).toContain('the queen on b2 forks the rook on a1 and the knight on b1');
    // No review "you stopped them" sentences about moves nobody played.
    expect(dossier.nodes.flatMap((node) => node.tactics).join(' ')).not.toMatch(/stopped/);
    expect(dossier.lines[0]?.openingName).toMatch(/Englund/);
  });

  test('a move that loses: the moved piece stopped guarding where the reply lands', () => {
    const { tree } = englund();
    const fenBefore = byId(tree).get('n14')?.fenAfter ?? '';

    expect(abandonedGuard(fenBefore, 'Qxc3', 'Qc1#')).toEqual(['the queen stops guarding c1, where Qc1# follows']);
    expect(abandonedGuard(fenBefore, 'Nxc3', 'Qxa1+')).toEqual([]);
    expect(abandonedGuard(fenBefore, 'Qxc3', undefined)).toEqual([]);
  });

  test('the Englund facts the first runs got wrong: no hanging rook on a1, no guard "left" by moving onto it', () => {
    const { tree } = englund();
    const nodes = byId(tree);
    const before = (id: string): string => nodes.get(nodes.get(id)?.parentId ?? '')?.fenAfter ?? tree.startFen;
    // 6.Bc3: …Qxa1 is answered by Bxa1, through b2 once the queen leaves it.
    expect(boardFacts(before('n11'), 'Bc3')).not.toContain('leaves the rook on a1 hanging');
    // 7.Qd2 unpins the bishop, which still answers …Qxa1.
    expect(boardFacts(before('n13'), 'Qd2')).not.toContain('leaves the rook on a1 hanging');
    // 7…Bxc3 lands on c3; Nxc3 takes the bishop there, no guard was left.
    expect(abandonedGuard(before('n14'), 'Bxc3', 'Nxc3')).toEqual([]);
    // A piece that really is loose still says so: Qxd5 walks into exd5.
    expect(boardFacts('4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1', 'Qxd5')).toContain('leaves the queen on d5 hanging');
  });

  test('the rendered dossier carries verdict words and no eval numbers', () => {
    const text = renderCourseDossier(englund().dossier);

    expect(text).toContain('n11 6.Bc3 (White, Line A)');
    expect(text).toContain('n12 6…Bb4 (Black, Line A)');
    expect(text).toContain('Black is winning');
    expect(text).toContain('flags: quiz-eligible');
    expect(text).toContain('    why Nc3 is better: moves the knight from b1 to c3');
    expect(text).not.toMatch(/\d\.\d|[+-]\d|\bcp\b|%|centipawn/i);
  });

  test("a tempting move names whose move each fact is, and the material over the line", () => {
    const { dossier } = englund();
    const tempting = {
      san: 'Nxe5',
      kind: 'capture' as const,
      does: ['moves the knight from c6 to e5', 'captures the pawn on e5'],
      refutation: ['Bxb4', 'Nxf3+', 'exf3'],
      after: ['moves the bishop from d2 to b4', 'captures the queen on b4'],
      captures: 'Black takes a pawn and a knight; White takes the queen and a knight',
      verdict: 'White is much better',
      balance: 'White is a queen up'
    };
    const nodes = dossier.nodes.map((node) => (node.nodeId === 'n10' ? { ...node, tempting: [tempting] } : node));
    const text = renderCourseDossier({ ...dossier, nodes });

    expect(text).toContain(
      "    tempting capture: Nxe5? Black's Nxe5 moves the knight from c6 to e5 | captures the pawn on e5. White answers Bxb4: moves the bishop from d2 to b4 | captures the queen on b4. Then Nxf3+ exf3. Over the line Black takes a pawn and a knight; White takes the queen and a knight; at the end White is a queen up (White is much better)."
    );
    expect(text).toMatch(/best instead: Nc3; after Nc3[^,]*, (material is level|White is a pawn up)/);
  });
});

describe('course skeleton', () => {
  test("endgame: the goal from the start's verdict, the material, the learner's moves and its only moves", () => {
    const { tree, dossier } = englund();
    const skeleton = buildCourseSkeleton({ kind: 'endgame', tree, lines: courseLineGames(tree), dossier });
    const black = dossier.nodes.filter((node) => node.side === 'black');

    expect(skeleton).toEqual({
      kind: 'endgame',
      lineId: 'l1',
      goal: 'draw',
      material: 'material is level',
      learnerNodeIds: black.map((node) => node.nodeId),
      onlyMoveNodeIds: black.filter((node) => node.quizEligible).map((node) => node.nodeId),
      deviationNodeIds: []
    });
    const winning = dossier.nodes.map((node, index) => (index === 0 ? { ...node, before: 'Black is winning' } : node));
    expect(buildCourseSkeleton({ kind: 'endgame', tree, lines: courseLineGames(tree), dossier: { ...dossier, nodes: winning } })).toMatchObject({ goal: 'win' });
  });

  test('trap: bait n11, answer n12, the rest punishes, Nc3 was safe', () => {
    const { tree, dossier } = englund();

    expect(buildCourseSkeleton({ kind: 'trap', tree, lines: courseLineGames(tree), dossier })).toEqual({
      kind: 'trap',
      lineId: 'l1',
      baitNodeId: 'n11',
      answerNodeId: 'n12',
      punishNodeIds: ['n13', 'n14', 'n15', 'n16'],
      safeMoveSan: 'Nc3',
      trapperRiskNodeIds: []
    });
  });

  test("tactics: an example starts before the opponent's mistake that allows it (Legal's mate)", () => {
    const tree = parseCourseTree('1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# *');
    const fen = (id: string): string => byId(tree).get(id)?.fenAfter ?? '';
    const won = new Set([fen('n10'), fen('n11'), fen('n12')]);
    const overrides = new Map<string, FakeEval>([
      [fen('n9'), { cp: 0, moves: [{ san: 'dxe5', cp: 0 }, { san: 'Bxd1', cp: 2000 }] }],
      [fen('n10'), { cp: 2000, moves: [{ san: 'Bxf7+', cp: 2000 }, { san: 'Kxd1', cp: 0 }] }]
    ]);
    const { dossier } = analyseCourse(tree, fakeEvals(tree, (value) => (won.has(value) ? 2000 : 0), overrides), 'white');

    expect(buildCourseSkeleton({ kind: 'tactics', tree, lines: courseLineGames(tree), dossier })).toEqual({
      kind: 'tactics',
      examples: [{ lineId: 'l1', nodeId: 'n11', startNodeId: 'n9', motif: null, depth: 3 }]
    });
    expect(dossier.nodes.find((node) => node.nodeId === 'n13')?.board).toContain(
      'why it is mate: the king on e7 is checked by the knight on d5; d6, d8, f8 hold its own pieces; d7 is covered by the knight on e5; e6 and e8 are covered by the bishop on f7; f6 is covered by the knight on d5; the bishop on f7 is guarded by the knight on e5'
    );
  });

  test('opening: learner moves per line, sidelines as deviations, a blunder answered as a trap', () => {
    const tree = parseCourseTree('1. e4 e5 2. Nf3 (2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#) 2... Nc6 *');
    const fen = (id: string): string => byId(tree).get(id)?.fenAfter ?? '';
    const overrides = new Map<string, FakeEval>([
      [fen('n7'), { cp: 0, moves: [{ san: 'g6', cp: 0 }, { san: 'Nf6', cp: 2000 }] }]
    ]);
    const lost = new Set([fen('n8')]);
    const { dossier } = analyseCourse(tree, fakeEvals(tree, (value) => (lost.has(value) ? 2000 : 0), overrides), 'white');
    const skeleton = buildCourseSkeleton({ kind: 'opening', tree, lines: courseLineGames(tree), dossier });

    expect(skeleton).toMatchObject({
      kind: 'opening',
      lines: [
        { lineId: 'l1', learnerNodeIds: ['n1', 'n3'] },
        { lineId: 'l2', learnerNodeIds: ['n1', 'n5', 'n7', 'n9'] }
      ],
      deviationNodeIds: ['n5'],
      traps: [{ blunderNodeId: 'n8', answerNodeId: 'n9' }]
    });
  });
});

describe('puzzle', () => {
  const SMOTHERED = '[SetUp "1"]\n[FEN "r6k/6pp/7N/8/8/1Q6/6PP/6K1 w - - 0 1"]\n\n1. Qg8+ Rxg8 2. Nf7# *';

  test('skeleton: every learner move, mate in 2, sound when each move is the one clear best', () => {
    const tree = parseCourseTree(SMOTHERED);
    const clear = new Map<string, FakeEval>([[tree.startFen, { cp: 2000, moves: [{ san: 'Qg8+', cp: 2000 }, { san: 'Qb8+', cp: 0 }] }]]);
    const sound = analyseCourse(tree, fakeEvals(tree, () => 2000, clear), 'white').dossier;
    expect(buildCourseSkeleton({ kind: 'puzzle', tree, lines: courseLineGames(tree), dossier: sound })).toEqual({
      kind: 'puzzle',
      lineId: 'l1',
      learnerNodeIds: ['n1', 'n3'],
      mateIn: 2,
      unsoundNodeIds: []
    });
    // Two moves as good as each other: the first move has a second answer.
    const level = analyseCourse(tree, fakeEvals(tree, () => 2000), 'white').dossier;
    expect(buildCourseSkeleton({ kind: 'puzzle', tree, lines: courseLineGames(tree), dossier: level })).toMatchObject({ unsoundNodeIds: ['n1'] });
  });

  test('learned by the side to move; a puzzle needs a position and one line', () => {
    expect(inferLearnerSide('puzzle', parseCourseTree(SMOTHERED), null)).toBe('white');
    expect(puzzleShapeProblems(parseCourseTree(SMOTHERED))).toEqual([]);
    expect(puzzleShapeProblems(parseCourseTree('1. e4 (1. d4) e5 *'))).toEqual([
      'A puzzle starts from a position: add its [FEN] header',
      'A puzzle has one solution line: remove the sidelines'
    ]);
  });

  test('an endgame is learned by the side to move, needs a position, and may have the defender\'s tries', () => {
    const lucena = '[FEN "1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1"]\n\n1. Rd1+ Ke7 (1... Kc6 2. Kc8) 2. Rd4 *';
    expect(inferLearnerSide('endgame', parseCourseTree(lucena), null)).toBe('white');
    expect(endgameShapeProblems(parseCourseTree(lucena))).toEqual([]);
    expect(endgameShapeProblems(parseCourseTree('1. e4 e5 *'))).toEqual(['An endgame starts from a position: add its [FEN] header']);
  });
});

describe('inferLearnerSide', () => {
  test('trap: the side that mates, else the side up material; level means ask', () => {
    expect(inferLearnerSide('trap', parseCourseTree(ENGLUND_TRAP), null)).toBe('black');
    expect(inferLearnerSide('trap', parseCourseTree('1. e4 d5 2. exd5 *'), null)).toBe('white');
    expect(inferLearnerSide('trap', parseCourseTree('1. e4 e5 *'), null)).toBeNull();
  });

  test('master game: the winner; a draw asks; openings always ask', () => {
    const tree = parseCourseTree('1. e4 e5 *');

    expect(inferLearnerSide('master_game', tree, '0-1')).toBe('black');
    expect(inferLearnerSide('master_game', tree, '1/2-1/2')).toBeNull();
    expect(inferLearnerSide('opening', tree, '1-0')).toBeNull();
  });
});
