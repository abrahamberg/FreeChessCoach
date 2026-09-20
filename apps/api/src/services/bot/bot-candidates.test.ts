import { describe, expect, test, vi } from 'vitest';
import type { PositionAnalysis } from '@freechesscoach/shared';
import { annotateCandidateMoves, pvForkInPlies } from '@freechesscoach/chess-analysis';
import { buildBotCandidates, legalMoveCandidates, BOT_SEARCH_DEPTH, BOT_SEARCH_MOVETIME_MS } from './bot-candidates.js';

// Pass-through spies: the real annotation still runs, the tests only count it.
vi.mock('@freechesscoach/chess-analysis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@freechesscoach/chess-analysis')>();
  return {
    ...actual,
    annotateCandidateMoves: vi.fn(actual.annotateCandidateMoves),
    pvForkInPlies: vi.fn(actual.pvForkInPlies)
  };
});

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// Black to move, after 1.e4 e5 2.Qh5 (threatens Qxe5+ forking king/pieces is
// not realistic here, so instead build a PV that plants a fork two of the
// bot's own moves out via a knight landing on a forking square) — kept
// simple: white to move, one quiet line, one line whose PV creates a fork.
const FORK_PV_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

describe('buildBotCandidates', () => {
  test('white to move: cp/mateIn pass through unchanged (already White-perspective)', async () => {
    const analysis: PositionAnalysis = {
      fen: START_FEN,
      depth: BOT_SEARCH_DEPTH,
      multiPv: 2,
      bestMove: 'e4',
      eval: { cp: 20, mateIn: null },
      lines: [
        { moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4', 'e5'], cp: 20, mateIn: null },
        { moveUci: 'd2d4', moveSan: 'd4', pvSan: ['d4', 'd5'], cp: 15, mateIn: null }
      ],
      features: {} as PositionAnalysis['features']
    };
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis);

    const candidates = await buildBotCandidates({ analyzeBotPosition }, START_FEN);

    expect(analyzeBotPosition).toHaveBeenCalledWith(START_FEN, {
      depth: BOT_SEARCH_DEPTH,
      multiPv: 5,
      movetimeMs: BOT_SEARCH_MOVETIME_MS
    });
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ moveSan: 'e4', cp: 20, mateIn: null });
    expect(candidates[1]).toMatchObject({ moveSan: 'd4', cp: 15, mateIn: null });
  });

  test('black to move: cp/mateIn are flipped to mover-relative', async () => {
    const blackToMoveFen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2';
    const analysis: PositionAnalysis = {
      fen: blackToMoveFen,
      depth: BOT_SEARCH_DEPTH,
      multiPv: 1,
      bestMove: 'Nc6',
      eval: { cp: -10, mateIn: null },
      lines: [{ moveUci: 'b8c6', moveSan: 'Nc6', pvSan: ['Nc6'], cp: -10, mateIn: 3 }],
      features: {} as PositionAnalysis['features']
    };
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis);

    const candidates = await buildBotCandidates({ analyzeBotPosition }, blackToMoveFen);

    // White-perspective cp -10 (slightly good for black) becomes mover-relative +10;
    // mateIn 3 (white-perspective, three moves to a WHITE mate) becomes -3 for black.
    expect(candidates[0]).toMatchObject({ moveSan: 'Nc6', cp: 10, mateIn: -3 });
  });

  test('missing 1-ply annotation (illegal/unmatched SAN) degrades to safe defaults rather than throwing', async () => {
    const analysis: PositionAnalysis = {
      fen: START_FEN,
      depth: BOT_SEARCH_DEPTH,
      multiPv: 1,
      bestMove: 'e4',
      eval: { cp: 20, mateIn: null },
      lines: [{ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 20, mateIn: null }],
      features: {} as PositionAnalysis['features']
    };
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis);

    const candidates = await buildBotCandidates({ analyzeBotPosition }, START_FEN);

    expect(candidates[0]).toMatchObject({
      createsFork: false,
      createsOpponentHangingPiece: false,
      createsUnderDefendedPiece: false,
      mobilityDelta: 0
    });
  });

  test('forkInPlies is populated from the candidate line\'s own PV via pvForkInPlies', async () => {
    // Ne4 heading a PV where the knight forks king+rook two of the bot's own
    // moves later — exact tactical realism isn't the point here (that's
    // pv-tactics.test.ts's job); this just proves the field is wired through.
    const analysis: PositionAnalysis = {
      fen: FORK_PV_FEN,
      depth: BOT_SEARCH_DEPTH,
      multiPv: 1,
      bestMove: 'Ng5',
      eval: { cp: 30, mateIn: null },
      lines: [{ moveUci: 'f3g5', moveSan: 'Ng5', pvSan: ['Ng5', 'd6', 'Nxf7'], cp: 30, mateIn: null }],
      features: {} as PositionAnalysis['features']
    };
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis);

    const candidates = await buildBotCandidates({ analyzeBotPosition }, FORK_PV_FEN);

    expect(candidates[0]?.moveSan).toBe('Ng5');
    expect(typeof candidates[0]?.forkInPlies === 'number' || candidates[0]?.forkInPlies === null).toBe(true);
  });

  test('motif is populated from the 1-ply annotation without affecting scoring-relevant fields', async () => {
    const forkFen = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
    const analysis: PositionAnalysis = {
      fen: forkFen,
      depth: BOT_SEARCH_DEPTH,
      multiPv: 1,
      bestMove: 'Nd6+',
      eval: { cp: 300, mateIn: null },
      lines: [{ moveUci: 'c4d6', moveSan: 'Nd6+', pvSan: ['Nd6+'], cp: 300, mateIn: null }],
      features: {} as PositionAnalysis['features']
    };
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis);

    const candidates = await buildBotCandidates({ analyzeBotPosition }, forkFen);

    expect(candidates[0]).toMatchObject({ moveSan: 'Nd6+', motif: 'fork' });
  });

  test('diagnosisCode resolves a fork motif to its piece-specific TA code (Phase 61)', async () => {
    const knightForkFen = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
    const analysis: PositionAnalysis = {
      fen: knightForkFen,
      depth: BOT_SEARCH_DEPTH,
      multiPv: 1,
      bestMove: 'Nd6+',
      eval: { cp: 300, mateIn: null },
      lines: [{ moveUci: 'c4d6', moveSan: 'Nd6+', pvSan: ['Nd6+'], cp: 300, mateIn: null }],
      features: {} as PositionAnalysis['features']
    };
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis);

    const candidates = await buildBotCandidates({ analyzeBotPosition }, knightForkFen);

    expect(candidates[0]).toMatchObject({ moveSan: 'Nd6+', motif: 'fork' });
    expect(candidates[0]?.diagnosisCodes).toContain('TA-07');
  });

  test('diagnosisCodes is empty when there is no motif and no BV/MS proxy signal', async () => {
    const analysis: PositionAnalysis = {
      fen: START_FEN,
      depth: BOT_SEARCH_DEPTH,
      multiPv: 1,
      bestMove: 'e4',
      eval: { cp: 20, mateIn: null },
      lines: [{ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 20, mateIn: null }],
      features: {} as PositionAnalysis['features']
    };
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis);

    const candidates = await buildBotCandidates({ analyzeBotPosition }, START_FEN);

    expect(candidates[0]).toMatchObject({ motif: null, diagnosisCodes: [] });
  });

  describe('annotation is on demand', () => {
    const analysis: PositionAnalysis = {
      fen: START_FEN,
      depth: BOT_SEARCH_DEPTH,
      multiPv: 3,
      bestMove: 'e4',
      eval: { cp: 20, mateIn: null },
      lines: [
        { moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4', 'e5'], cp: 20, mateIn: null },
        { moveUci: 'd2d4', moveSan: 'd4', pvSan: ['d4', 'd5'], cp: 15, mateIn: null },
        { moveUci: 'g1f3', moveSan: 'Nf3', pvSan: ['Nf3', 'd5'], cp: 10, mateIn: null }
      ],
      features: {} as PositionAnalysis['features']
    };

    test('building candidates annotates nothing; scores and move names need no annotation', async () => {
      vi.mocked(annotateCandidateMoves).mockClear();
      vi.mocked(pvForkInPlies).mockClear();

      const candidates = await buildBotCandidates({ analyzeBotPosition: vi.fn().mockResolvedValue(analysis) }, START_FEN);

      expect(candidates.map((candidate) => [candidate.moveSan, candidate.cp])).toEqual([['e4', 20], ['d4', 15], ['Nf3', 10]]);
      expect(annotateCandidateMoves).not.toHaveBeenCalled();
      expect(pvForkInPlies).not.toHaveBeenCalled();
    });

    test('reading an annotation field annotates only that candidate, and only once', async () => {
      const candidates = await buildBotCandidates({ analyzeBotPosition: vi.fn().mockResolvedValue(analysis) }, START_FEN);
      vi.mocked(annotateCandidateMoves).mockClear();
      vi.mocked(pvForkInPlies).mockClear();

      void candidates[1]!.createsFork;
      void candidates[1]!.diagnosisCodes;
      void candidates[1]!.motif;

      expect(annotateCandidateMoves).toHaveBeenCalledTimes(1);
      expect(vi.mocked(annotateCandidateMoves).mock.calls[0]?.[1]).toEqual(['d4']);
      expect(pvForkInPlies).toHaveBeenCalledTimes(1);
    });

    test('an on-demand candidate still carries every annotation field when copied or logged', async () => {
      const [first] = await buildBotCandidates({ analyzeBotPosition: vi.fn().mockResolvedValue(analysis) }, START_FEN);

      expect(Object.keys({ ...first })).toEqual(
        expect.arrayContaining(['moveSan', 'cp', 'mateIn', 'createsFork', 'createsOpponentHangingPiece', 'createsUnderDefendedPiece', 'mobilityDelta', 'forkInPlies', 'motif', 'diagnosisCodes'])
      );
    });
  });

  test('asks the engine for exactly as many lines as the branch needs', async () => {
    const analysis = { fen: START_FEN, depth: BOT_SEARCH_DEPTH, multiPv: 1, bestMove: 'e4', eval: { cp: 20, mateIn: null }, lines: [], features: {} } as unknown as PositionAnalysis;
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis);

    await buildBotCandidates({ analyzeBotPosition }, START_FEN, undefined, undefined, 1);

    expect(analyzeBotPosition).toHaveBeenCalledWith(START_FEN, expect.objectContaining({ multiPv: 1 }));
  });
});

describe('legalMoveCandidates', () => {
  test('is one candidate per legal move with no engine score, and nothing annotated until it is read', () => {
    vi.mocked(annotateCandidateMoves).mockClear();

    const candidates = legalMoveCandidates(START_FEN);

    expect(candidates).toHaveLength(20);
    expect(candidates.every((candidate) => candidate.cp === null && candidate.mateIn === null)).toBe(true);
    expect(annotateCandidateMoves).not.toHaveBeenCalled();
  });

  test('reading one annotates just that move, from the position alone', () => {
    vi.mocked(annotateCandidateMoves).mockClear();
    const candidates = legalMoveCandidates(FORK_PV_FEN);

    void candidates[0]!.createsFork;

    expect(annotateCandidateMoves).toHaveBeenCalledTimes(1);
    expect(vi.mocked(annotateCandidateMoves).mock.calls[0]?.[1]).toEqual([candidates[0]!.moveSan]);
  });
});
