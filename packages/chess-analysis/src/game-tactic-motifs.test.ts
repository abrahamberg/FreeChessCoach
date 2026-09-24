import { describe, expect, test } from 'vitest';
import type { ClassifiedMoveDto, EngineEval, EngineLine } from '@freechesscoach/shared';
import { classifyTacticMotifOpportunity, computeTacticMotifCounts } from './game-tactic-motifs.js';
import type { MoveVerdict, VerdictReason } from './move-verdict/types.js';

// Nd6+ forks the king on e8 and the rook on b7. The king on a1 is boxed in by
// the rook's file, so Ka2 is its only quiet move.
const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const FORK: EngineLine = { moveUci: 'c4d6', moveSan: 'Nd6+', cp: 500, mateIn: null, pvSan: ['Nd6+', 'Kd8', 'Nxb7+'] };

// White is a queen and a rook up; Re8# and Qc8# both mate on the back rank.
const MATE_FEN = '7k/6pp/8/8/8/8/2Q2PPP/4R1K1 w - - 0 1';
const RE8_MATE: EngineLine = { moveUci: 'e1e8', moveSan: 'Re8#', cp: null, mateIn: 1, pvSan: ['Re8#'] };
const QC8_MATE: EngineLine = { moveUci: 'c2c8', moveSan: 'Qc8#', cp: null, mateIn: 1, pvSan: ['Qc8#'] };

function quiet(moveSan: string, moveUci: string, cp: number): EngineLine {
  return { moveUci, moveSan, cp, mateIn: null, pvSan: [moveSan] };
}

function evalsFor(fen: string, lines: EngineLine[]): EngineEval[] {
  return [{ ply: 0, fen, depth: 18, lines }];
}

function move(overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveNumber: 1,
    moveSan: 'Ka2',
    uci: 'a1a2',
    mover: 'white',
    isUserMove: true,
    cpLoss: 0,
    quality: 'blunder',
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore: FORK_FEN,
    isTacticalPosition: true,
    ...overrides
  } as ClassifiedMoveDto;
}

describe('classifyTacticMotifOpportunity — eval witness', () => {
  test('a motif on the best move whose second line is as good decided nothing: no opportunity', () => {
    const evals = evalsFor(FORK_FEN, [FORK, quiet('Ka2', 'a1a2', 480)]);
    const played = move({ cpBefore: 500, cpAfter: 0 });

    expect(classifyTacticMotifOpportunity(played, evals)).toBeNull();
  });

  test('a real fork missed, with a meaningful drop, is an opportunity not found', () => {
    const evals = evalsFor(FORK_FEN, [FORK, quiet('Ka2', 'a1a2', 0)]);
    const played = move({ cpBefore: 500, cpAfter: 0 });

    expect(classifyTacticMotifOpportunity(played, evals)).toMatchObject({ type: 'fork', found: false, embodiedBySan: 'Nd6+' });
  });

  test('a missed motif whose played move kept the value is neither missed nor found', () => {
    // A single engine line, so the materiality gate has nothing to compare
    // against and keeps the opportunity; the played move then settles it.
    const evals = evalsFor(FORK_FEN, [FORK]);
    const played = move({ quality: 'good', cpBefore: 500, cpAfter: 470 });

    expect(classifyTacticMotifOpportunity(played, evals)).toBeNull();
  });

  test('a missed mate at +15 is still an opportunity: the saturated band reads centipawns', () => {
    // Qc8# carries the same headline, so the comparison skips it and lands
    // on h3, 490 cp worse but barely a win% point.
    const evals = evalsFor(MATE_FEN, [RE8_MATE, QC8_MATE, quiet('h3', 'h2h3', 1500)]);
    const played = move({ fenBefore: MATE_FEN, moveSan: 'h3', uci: 'h2h3', quality: 'miss', cpBefore: 1990, cpAfter: 1500 });

    expect(classifyTacticMotifOpportunity(played, evals)).toMatchObject({ type: 'checkmate', found: false });
  });

  test('every line carrying the same headline keeps the opportunity', () => {
    const evals = evalsFor(MATE_FEN, [RE8_MATE, QC8_MATE]);
    const played = move({ fenBefore: MATE_FEN, moveSan: 'h3', uci: 'h2h3', quality: 'miss', cpBefore: 1990, cpAfter: 1500 });

    expect(classifyTacticMotifOpportunity(played, evals)).toMatchObject({ type: 'checkmate', found: false });
  });

  test('the best move played is found, whatever the second line says about materiality', () => {
    const evals = evalsFor(FORK_FEN, [FORK, quiet('Ka2', 'a1a2', 0)]);
    const played = move({ moveSan: 'Nd6+', uci: 'c4d6', quality: 'best', cpBefore: 500, cpAfter: 500 });

    expect(classifyTacticMotifOpportunity(played, evals)).toMatchObject({ type: 'fork', found: true });
  });

  test('a legacy move with no stored evals keeps today\'s eval-blind verdict', () => {
    const evals = evalsFor(FORK_FEN, [FORK, quiet('Ka2', 'a1a2', 480)]);

    expect(classifyTacticMotifOpportunity(move({ quality: 'good' }), evals)).toMatchObject({ type: 'fork', found: false });
  });
});

describe('computeTacticMotifCounts — from verdicts', () => {
  const verdictOf = (reason: VerdictReason, type: 'fork' | 'matingNet' | 'checkmate'): MoveVerdict => ({
    kind: reason.startsWith('found') || reason === 'defusedThreat' ? 'credit' : 'failure',
    reason,
    explainedCpWhite: 0,
    gainedPawns: 0,
    lostPawns: 0,
    card: { tacticOpportunity: { type, found: reason.startsWith('found'), detail: null, visual: null }, detail: null }
  });

  test('missed and found tactics count under their motif', () => {
    const counts = computeTacticMotifCounts([verdictOf('missedTactic', 'fork'), verdictOf('foundTactic', 'fork'), null]);
    expect(counts.fork).toEqual({ opportunities: 2, found: 1 });
  });

  // Task 77.5 follow-up: mates are their own verdicts, and still count
  // under `checkmate` whatever motif their card names.
  test('a missed mate is a checkmate opportunity; a found mate an opportunity and a find', () => {
    const counts = computeTacticMotifCounts([verdictOf('missedMate', 'checkmate'), verdictOf('foundMate', 'matingNet')]);
    expect(counts.checkmate).toEqual({ opportunities: 2, found: 1 });
    expect(counts.matingNet).toEqual({ opportunities: 0, found: 0 });
  });
});
