import { Chess } from 'chess.js';
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
    expect(facts.get('n12')?.board).toEqual(['moves the bishop from f8 to b4', 'attacks the bishop on c3, which is pinned to the king by the bishop on b4']);
    expect(facts.get('n5')?.quizEligible).toBe(false);
    expect(facts.get('n16')?.after).toBe('checkmate');
    expect(facts.get('n16')?.board).toContain('gives checkmate');
    // A piece the checking piece "attacks" is not pinned by it: the king is
    // attacked already (4...Qb4+). 7...Bxc3+ does pin the queen. A mate
    // (8...Qc1#) lists no attacks at all.
    expect(facts.get('n8')?.board).toContain('attacks the bishop on f4');
    expect(facts.get('n16')?.board.join(' | ')).not.toContain('attacks');
    expect(facts.get('n14')?.board).toContain('attacks the queen on d2, which is pinned to the king by the bishop on c3');
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

  test('the facts the golden variations got wrong (Phase 106)', () => {
    const after = (pgn: string): string => {
      const chess = new Chess();
      chess.loadPgn(pgn);
      return chess.fen();
    };
    // Qc1#: f1 and h1 are covered through the king on g1.
    const mate = boardFacts('2q3k1/5ppp/1N6/8/8/8/5PPP/6K1 b - - 1 1', 'Qc1#').join(' | ');
    expect(mate).toContain('f1 and h1 are covered by the queen on c1');
    expect(mate).not.toMatch(/covered by (;|$|\|)/);
    // Philidor's Legacy 3.Qg8+: the rook takes the queen, so it forks nothing.
    expect(boardFacts('r6k/6pp/7N/8/2Q5/8/6PP/6K1 w - - 0 3', 'Qg8+').join(' | ')).not.toContain('forks');
    expect(boardFacts('2q3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1', 'Ne7+')).toContain('the knight on e7 forks the queen on c8 and the king on g8');
    // Nd6# mates: no "attacks the bishop on c8", no fork.
    const nd6 = boardFacts(after('1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nd7 5. Qe2 Ngf6'), 'Nd6#').join(' | ');
    expect(nd6).not.toMatch(/attacks|forks/);
    // The Elephant bait: why Nxd5 looks safe.
    expect(boardFacts(after('1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Nbd7 5. cxd5 exd5'), 'Nxd5')).toContain('attacks the knight on f6, which is pinned to the queen on d8 by the bishop on g5');
    // Noah's Ark: the bishop on b3 has nowhere to go.
    const noah = after('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 d6 5. d4 b5 6. Bb3 Nxd4 7. Nxd4 exd4 8. Qxd4 c5 9. Qd5 Be6 10. Qc6+ Bd7 11. Qd5');
    expect(boardFacts(noah, 'c4')).toContain('attacks the bishop on b3, which is trapped: every square it can reach loses it');
    // In check, or with an attacker it can take: not trapped. The Petrov's
    // Nc6+ discovers check on the queen; a knight that walks into …axb6.
    const petrov = after('1. e4 e5 2. Nf3 Nf6 3. Nxe5 Nxe4 4. Qe2 Nf6');
    expect(boardFacts(petrov, 'Nc6+').join(' | ')).not.toContain('trapped');
    expect(boardFacts('r3k3/p7/8/3N4/8/8/8/4K3 w - - 0 1', 'Nb6').join(' | ')).not.toContain('trapped');
    // A capture taken back is a trade: 3…cxd4 leaves nothing hanging.
    expect(boardFacts(after('1. e4 c5 2. Nf3 d6 3. d4'), 'cxd4').join(' | ')).not.toContain('hanging');
    // The endgame ideas, from the board: promotion, the bridge, the
    // opposition, the square.
    expect(boardFacts('8/5P2/4k3/8/8/8/8/7K w - - 0 1', 'f8=Q')).toContain('promotes to a queen');
    expect(boardFacts('8/1P6/8/1K6/3R4/8/4k3/1r6 w - - 0 1', 'Rb4')).toContain('blocks the check from the rook on b1');
    expect(boardFacts('4k3/4P3/5K2/8/8/8/8/8 w - - 0 1', 'Ke6').join(' | ')).not.toContain('opposition');
    expect(boardFacts('4k3/8/8/4K3/4P3/8/8/8 b - - 0 1', 'Ke7')).toContain('takes the opposition: the kings face each other with one square between, and the other king must give way');
    expect(boardFacts('8/8/8/8/8/8/k4P2/7K w - - 0 1', 'f4')).toContain("the black king on a2 is outside the pawn's square: it cannot catch the pawn");
    expect(boardFacts('8/8/8/3k4/8/8/5P2/7K w - - 0 1', 'f4').join(' | ')).not.toContain('square');
    // The Petrov's 5.Nc6+: the queen checks, not the knight.
    expect(boardFacts(petrov, 'Nc6+')).toContain('a discovered check from the queen on e2');
    // A boxed-in piece another move saves is not trapped: …Nc6 shields the
    // rook in its corner, …Nd7 frees it.
    const corner = boardFacts('rn2k3/p7/8/8/2B5/8/8/4K3 w - - 0 1', 'Bd5');
    expect(corner).toContain('attacks the rook on a8');
    expect(corner.join(' | ')).not.toContain('trapped');
    // Boxed in with no rescue, it is trapped (Legal's mate: Nxf7 on the rook
    // behind its knight and pawn).
    expect(boardFacts('rnbqkbnr/ppp2ppp/3p4/4N3/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 0 5', 'Nxf7').join(' | ')).toContain('attacks the rook on h8, which is trapped: it cannot move, and no move saves it');
    // A piece that can run is not trapped.
    expect(boardFacts('4k3/8/8/2b5/8/8/1P6/4K3 w - - 0 1', 'b4').join(' | ')).not.toContain('trapped');
  });

  test('best instead only on an error; the last move of a long line in full', () => {
    const { dossier } = englund();
    const bait = dossier.nodes.find((node) => node.nodeId === 'n11')!;
    const asBook = renderCourseDossier({ ...dossier, nodes: dossier.nodes.map((node) => (node === bait ? { ...node, quality: 'book' as const } : node)) });
    expect(asBook).not.toContain('best instead: Nc3');
    // Nor a verdict: a book move's eval sits on a word's edge.
    expect(asBook).toMatch(/^n11 6\.Bc3 \(White, Line A\) \| book$/m);

    const routine = { ...bait, quality: 'good' as const, critical: false, quizEligible: false, tactics: [], creatorComment: null };
    const nodes = Array.from({ length: 45 }, (_, index) => ({ ...routine, nodeId: `n${index + 1}` }));
    const text = renderCourseDossier({ ...dossier, nodes });
    expect(text).toMatch(/^n44 [^\n]*\| good$/m);
    expect(text).toMatch(/^n45 [^\n]*\| good \| before: /m);
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
      balance: 'White is a queen up',
      notTheAnswer: null
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
  test('endgame: "much better" at the start is a win (no tablebase says "winning")', () => {
    const { tree, dossier } = englund();
    const nodes = dossier.nodes.map((node, index) => (index === 0 ? { ...node, before: 'Black is much better' } : node));
    const skeleton = buildCourseSkeleton({ kind: 'endgame', tree, lines: courseLineGames(tree), dossier: { ...dossier, nodes } });

    expect(skeleton?.kind === 'endgame' && skeleton.goal).toBe('win');
    // Or a line that ends won: the Saavedra starts at "White is better".
    const ends = dossier.nodes.map((node, index) => (index === dossier.nodes.length - 1 ? { ...node, after: 'Black is winning' } : node));
    const saavedra = buildCourseSkeleton({ kind: 'endgame', tree, lines: courseLineGames(tree), dossier: { ...dossier, nodes: ends } });
    expect(saavedra?.kind === 'endgame' && saavedra.goal).toBe('win');
  });

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
      deviationNodeIds: [],
      wrongNodeIds: black.filter((node) => ['inaccuracy', 'mistake', 'blunder', 'miss'].includes(node.quality)).map((node) => node.nodeId)
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

  test('the king taking the checker takes it', () => {
    const facts = boardFacts('r1bqkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNBQ1RK1 w kq - 1 8', 'Qxd8+').join(' | ');
    expect(facts).toContain('the check can be answered: no block; take the checking piece with Kxd8; the king cannot move');
  });

  test('a check answered by promoting names one promotion; a bare endgame has no king-safety words, and a lone pawn is passed, not isolated', () => {
    const facts = boardFacts('7K/8/8/8/8/8/3pk3/Q7 w - - 0 1', 'Qe1+').join(' | ');
    expect(facts).toContain('take the checking piece with dxe1=Q, Kxe1;');
    expect(facts).not.toContain('dxe1=N');
    const tree = parseCourseTree('[SetUp "1"]\n[FEN "7K/8/8/8/8/8/3pk3/Q7 w - - 0 1"]\n\n1. Qe5+ Kf2 *');
    const { dossier } = analyseCourse(tree, fakeEvals(tree, () => 900), 'white');
    expect(dossier.lines[0]?.endFeatures.join(' | ')).not.toMatch(/king is (still in the centre|tucked away)/);
    expect(dossier.lines[0]?.endFeatures).toContain('black has a passed pawn on d2');
    expect(dossier.lines[0]?.endFeatures.join(' | ')).not.toMatch(/isolated|majority/);
  });

  test('en passant names the pawn it takes, on its own square', () => {
    const facts = boardFacts('7r/8/7p/R4Ppk/8/3B1PK1/8/7q w - g6 0 1', 'fxg6#');
    expect(facts).toContain('captures the pawn on g5 en passant');
    expect(facts.join(' | ')).not.toContain('captures the pawn on g6');
    expect(facts).toContain('a discovered check from the rook on a5');
  });

  test('a position that comes back says so: twice, then a draw by repetition', () => {
    const tree = parseCourseTree('[SetUp "1"]\n[FEN "7k/6p1/7p/8/3Q4/8/1pr2PPP/q4BK1 w - - 0 1"]\n\n1. Qd8+ Kh7 2. Qd3+ Kh8 3. Qd8+ Kh7 4. Qd3+ Kh8 5. Qd8+ *');
    const { dossier } = analyseCourse(tree, fakeEvals(tree, () => 0), 'white');
    const board = (id: string): string[] => dossier.nodes.find((node) => node.nodeId === id)?.board ?? [];
    expect(board('n1')).not.toContain('the position has now come twice: a third time is a draw');
    expect(board('n5')).toContain('the position has now come twice: a third time is a draw');
    expect(board('n9')).toContain('the position has now come three times: a draw by repetition');
  });

  test("a puzzle's goal comes from the line's end: a stalemate or a save from a lost start is a draw; a level line or a check series the defender escapes is no goal", () => {
    const stalemate = parseCourseTree('[SetUp "1"]\n[FEN "7k/7p/4Q2P/8/8/6K1/r7/8 b - - 0 1"]\n\n1... Rg2+ 2. Kxg2 *');
    const drawn = analyseCourse(stalemate, fakeEvals(stalemate, () => 0), 'black').dossier;
    expect(buildCourseSkeleton({ kind: 'puzzle', tree: stalemate, lines: courseLineGames(stalemate), dossier: drawn })).toMatchObject({ mateIn: null, goal: 'draw' });
    const escape = parseCourseTree('[SetUp "1"]\n[FEN "7k/6p1/7p/8/8/8/1qr2PPP/3Q2K1 w - - 0 1"]\n\n1. Qd8+ Kh7 2. Qd3+ g6 *');
    const level = analyseCourse(escape, fakeEvals(escape, () => 0), 'white').dossier;
    expect(buildCourseSkeleton({ kind: 'puzzle', tree: escape, lines: courseLineGames(escape), dossier: level })).toMatchObject({ goal: 'none' });
    const saved = analyseCourse(escape, fakeEvals(escape, (fen) => (fen === escape.startFen ? -600 : 0)), 'white').dossier;
    expect(buildCourseSkeleton({ kind: 'puzzle', tree: escape, lines: courseLineGames(escape), dossier: saved })).toMatchObject({ goal: 'draw' });
    const lost = analyseCourse(escape, fakeEvals(escape, () => -600), 'white').dossier;
    expect(buildCourseSkeleton({ kind: 'puzzle', tree: escape, lines: courseLineGames(escape), dossier: lost })).toMatchObject({ mateIn: null, goal: 'none' });
    const won = analyseCourse(escape, fakeEvals(escape, () => 600), 'white').dossier;
    expect(buildCourseSkeleton({ kind: 'puzzle', tree: escape, lines: courseLineGames(escape), dossier: won })).toMatchObject({ goal: 'win' });
  });

  test('skeleton: every learner move, mate in 2, sound when each move is the one clear best', () => {
    const tree = parseCourseTree(SMOTHERED);
    const clear = new Map<string, FakeEval>([[tree.startFen, { cp: 2000, moves: [{ san: 'Qg8+', cp: 2000 }, { san: 'Qb8+', cp: 0 }] }]]);
    const sound = analyseCourse(tree, fakeEvals(tree, () => 2000, clear), 'white').dossier;
    expect(buildCourseSkeleton({ kind: 'puzzle', tree, lines: courseLineGames(tree), dossier: sound })).toEqual({
      kind: 'puzzle',
      lineId: 'l1',
      learnerNodeIds: ['n1', 'n3'],
      mateIn: 2,
      goal: 'mate',
      unsoundNodeIds: [],
      wrongNodeIds: []
    });
    // Two moves as good as each other: the first move has a second answer.
    const level = analyseCourse(tree, fakeEvals(tree, () => 2000), 'white').dossier;
    expect(buildCourseSkeleton({ kind: 'puzzle', tree, lines: courseLineGames(tree), dossier: level })).toMatchObject({ unsoundNodeIds: ['n1'] });
    // A solution move the engine calls an error is wrong, not a second answer.
    const blunder = { ...sound, nodes: sound.nodes.map((node) => (node.nodeId === 'n1' ? { ...node, quality: 'blunder' as const, quizEligible: false } : node)) };
    expect(buildCourseSkeleton({ kind: 'puzzle', tree, lines: courseLineGames(tree), dossier: blunder })).toMatchObject({ unsoundNodeIds: [], wrongNodeIds: ['n1'] });
    // An inaccuracy is slower, not wrong.
    const slower = { ...sound, nodes: sound.nodes.map((node) => (node.nodeId === 'n1' ? { ...node, quality: 'inaccuracy' as const, quizEligible: false } : node)) };
    expect(buildCourseSkeleton({ kind: 'puzzle', tree, lines: courseLineGames(tree), dossier: slower })).toMatchObject({ unsoundNodeIds: ['n1'], wrongNodeIds: [] });
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
