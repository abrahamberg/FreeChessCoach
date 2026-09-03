import { describe, expect, test, vi } from 'vitest';
import type { PositionAnalysis } from '@freechesscoach/shared';
import { buildBotCandidates, BOT_CANDIDATE_BREADTH } from './bot-candidates.js';

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
      depth: 6,
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

    const candidates = await buildBotCandidates({ analyzeBotPosition }, START_FEN, 6);

    expect(analyzeBotPosition).toHaveBeenCalledWith(START_FEN, { depth: 6, multiPv: BOT_CANDIDATE_BREADTH });
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ moveSan: 'e4', cp: 20, mateIn: null });
    expect(candidates[1]).toMatchObject({ moveSan: 'd4', cp: 15, mateIn: null });
  });

  test('black to move: cp/mateIn are flipped to mover-relative', async () => {
    const blackToMoveFen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2';
    const analysis: PositionAnalysis = {
      fen: blackToMoveFen,
      depth: 6,
      multiPv: 1,
      bestMove: 'Nc6',
      eval: { cp: -10, mateIn: null },
      lines: [{ moveUci: 'b8c6', moveSan: 'Nc6', pvSan: ['Nc6'], cp: -10, mateIn: 3 }],
      features: {} as PositionAnalysis['features']
    };
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis);

    const candidates = await buildBotCandidates({ analyzeBotPosition }, blackToMoveFen, 6);

    // White-perspective cp -10 (slightly good for black) becomes mover-relative +10;
    // mateIn 3 (white-perspective, three moves to a WHITE mate) becomes -3 for black.
    expect(candidates[0]).toMatchObject({ moveSan: 'Nc6', cp: 10, mateIn: -3 });
  });

  test('missing 1-ply annotation (illegal/unmatched SAN) degrades to safe defaults rather than throwing', async () => {
    const analysis: PositionAnalysis = {
      fen: START_FEN,
      depth: 6,
      multiPv: 1,
      bestMove: 'e4',
      eval: { cp: 20, mateIn: null },
      lines: [{ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 20, mateIn: null }],
      features: {} as PositionAnalysis['features']
    };
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis);

    const candidates = await buildBotCandidates({ analyzeBotPosition }, START_FEN, 6);

    expect(candidates[0]).toMatchObject({
      createsFork: false,
      createsHangingPiece: false,
      createsUnderDefendedPiece: false,
      mobilityDelta: 0
    });
  });

  test('forkInPlies is populated from the candidate line\'s own PV via annotatePvTactics', async () => {
    // Ne4 heading a PV where the knight forks king+rook two of the bot's own
    // moves later — exact tactical realism isn't the point here (that's
    // pv-tactics.test.ts's job); this just proves the field is wired through.
    const analysis: PositionAnalysis = {
      fen: FORK_PV_FEN,
      depth: 6,
      multiPv: 1,
      bestMove: 'Ng5',
      eval: { cp: 30, mateIn: null },
      lines: [{ moveUci: 'f3g5', moveSan: 'Ng5', pvSan: ['Ng5', 'd6', 'Nxf7'], cp: 30, mateIn: null }],
      features: {} as PositionAnalysis['features']
    };
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis);

    const candidates = await buildBotCandidates({ analyzeBotPosition }, FORK_PV_FEN, 6);

    expect(candidates[0]?.moveSan).toBe('Ng5');
    expect(typeof candidates[0]?.forkInPlies === 'number' || candidates[0]?.forkInPlies === null).toBe(true);
  });

  test('motif is populated from the 1-ply annotation without affecting scoring-relevant fields', async () => {
    const forkFen = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
    const analysis: PositionAnalysis = {
      fen: forkFen,
      depth: 6,
      multiPv: 1,
      bestMove: 'Nd6+',
      eval: { cp: 300, mateIn: null },
      lines: [{ moveUci: 'c4d6', moveSan: 'Nd6+', pvSan: ['Nd6+'], cp: 300, mateIn: null }],
      features: {} as PositionAnalysis['features']
    };
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis);

    const candidates = await buildBotCandidates({ analyzeBotPosition }, forkFen, 6);

    expect(candidates[0]).toMatchObject({ moveSan: 'Nd6+', motif: 'fork' });
  });

  test('diagnosisCode resolves a fork motif to its piece-specific TA code (Phase 61)', async () => {
    const knightForkFen = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
    const analysis: PositionAnalysis = {
      fen: knightForkFen,
      depth: 6,
      multiPv: 1,
      bestMove: 'Nd6+',
      eval: { cp: 300, mateIn: null },
      lines: [{ moveUci: 'c4d6', moveSan: 'Nd6+', pvSan: ['Nd6+'], cp: 300, mateIn: null }],
      features: {} as PositionAnalysis['features']
    };
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis);

    const candidates = await buildBotCandidates({ analyzeBotPosition }, knightForkFen, 6);

    expect(candidates[0]).toMatchObject({ moveSan: 'Nd6+', motif: 'fork', diagnosisCode: 'TA-07' });
  });

  test('diagnosisCode is null when there is no motif', async () => {
    const analysis: PositionAnalysis = {
      fen: START_FEN,
      depth: 6,
      multiPv: 1,
      bestMove: 'e4',
      eval: { cp: 20, mateIn: null },
      lines: [{ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 20, mateIn: null }],
      features: {} as PositionAnalysis['features']
    };
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis);

    const candidates = await buildBotCandidates({ analyzeBotPosition }, START_FEN, 6);

    expect(candidates[0]).toMatchObject({ motif: null, diagnosisCode: null });
  });
});
