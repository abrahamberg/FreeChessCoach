import type { ClassifiedMoveDto, EngineEval, PositionAnalysisLine } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { combineThreatOutcome } from '@freechesscoach/chess-analysis';
import { createPreventionScans } from './tactic-prevention.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const FORK_FEN_BLACK_TO_MOVE = '4k3/1r6/8/8/2N5/8/8/K7 b - - 0 1';
const ROOK_MOVED_AWAY_FEN = '4k3/8/8/8/2N5/8/8/K7 w - - 0 1';

// Two-motif fixtures (mirrors packages/chess-analysis's
// tactic-prevention-check.test.ts): white has both a fork (Nd6+, forking the
// king on e8 and the rook on b7) and a free undefended pawn (Qxd3)
// available. Moving the rook to d8 answers both at once — the knight check
// then has only the king to hit, and the rook guards d3 down the open file.
const TWO_MOTIF_FEN = '4k3/1r6/8/8/2N5/3p4/8/3Q3K w - - 0 1';
const TWO_MOTIF_DEFUSED_FEN = '3rk3/8/8/8/2N5/3p4/8/3Q3K w - - 0 1';
const TWO_MOTIF_LINES: PositionAnalysisLine[] = [
  { moveUci: 'c4d6', moveSan: 'Nd6+', pvSan: ['Nd6+'], cp: 500, mateIn: null },
  // Close enough to the fork's line that White would really play it: a threat
  // only reachable through a clearly worse line is not one (realisticThreatScan).
  { moveUci: 'd1d3', moveSan: 'Qxd3', pvSan: ['Qxd3'], cp: 480, mateIn: null }
];

// Typed as the richer PositionAnalysisLine (always-present pvSan) so the
// same fixtures work both as EngineEval.lines (EngineLine's pvSan is
// optional — a superset accepts this) and as PositionAnalysis.lines.
const FORK_LINE: PositionAnalysisLine = { moveUci: 'c4d6', moveSan: 'Nd6+', pvSan: ['Nd6+'], cp: 500, mateIn: null };
const QUIET_LINE: PositionAnalysisLine = { moveUci: 'a1b1', moveSan: 'Kb1', pvSan: ['Kb1'], cp: 0, mateIn: null };

function move(overrides: Partial<ClassifiedMoveDto> & { ply: number; mover: 'white' | 'black' }): ClassifiedMoveDto {
  return {
    moveSan: 'e4',
    isUserMove: true,
    cpLoss: 0,
    quality: 'good',
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    ...overrides
  } as ClassifiedMoveDto;
}

function evalAt(fen: string, ply: number, lines: PositionAnalysisLine[]): EngineEval {
  return { ply, fen, depth: 12, lines };
}

const faced = (fenAfter: string) => [
  move({ ply: 1, mover: 'white', moveSan: 'Nc4', fenBefore: FORK_FEN, fenAfter: FORK_FEN_BLACK_TO_MOVE }),
  move({ ply: 2, mover: 'black', moveSan: 'Rb7', fenBefore: FORK_FEN_BLACK_TO_MOVE, fenAfter })
];

/** The outcome the `defusedThreat` verdict reads for ply 2. */
function outcomeAt(allMoves: ClassifiedMoveDto[], evals: EngineEval[], ply = 2) {
  const target = allMoves.find((candidate) => candidate.ply === ply);
  const scans = target ? createPreventionScans(allMoves, evals)(target) : null;
  return scans ? combineThreatOutcome(scans.before, scans.after) : null;
}

// Task 77.5: the scans are built lazily, per move, for the `defusedThreat`
// verdict; counts and cards come from the verdicts (build-game-report.ts).
describe('createPreventionScans', () => {
  test("free path: reuses prior.fenBefore's and move.fenAfter's own evals, no engine involved", () => {
    const evals: EngineEval[] = [evalAt(FORK_FEN, 0, [FORK_LINE]), evalAt(FORK_FEN_BLACK_TO_MOVE, 1, []), evalAt(ROOK_MOVED_AWAY_FEN, 2, [FORK_LINE])];
    const outcome = outcomeAt(faced(ROOK_MOVED_AWAY_FEN), evals);

    expect(outcome?.defused).toEqual(['fork']);
    expect(outcome?.defusedSightings[0]?.claim).toMatchObject({ detail: 'knight on d6 forks e8 and b7', verifiedGain: 5, prize: 'rook' });
  });

  test('a threat left standing is preventable but not defused', () => {
    const evals: EngineEval[] = [evalAt(FORK_FEN, 0, [FORK_LINE]), evalAt(FORK_FEN_BLACK_TO_MOVE, 1, []), evalAt(FORK_FEN, 2, [FORK_LINE])];
    const outcome = outcomeAt(faced(FORK_FEN), evals);

    expect(outcome?.preventable).toEqual(['fork']);
    expect(outcome?.defused).toEqual([]);
  });

  test('a move defusing two distinct motif types defuses both', () => {
    const allMoves = [
      move({ ply: 1, mover: 'white', moveSan: 'Kh1', fenBefore: TWO_MOTIF_FEN, fenAfter: TWO_MOTIF_FEN }),
      move({ ply: 2, mover: 'black', moveSan: 'Rd8', fenBefore: TWO_MOTIF_FEN, fenAfter: TWO_MOTIF_DEFUSED_FEN })
    ];
    const evals: EngineEval[] = [
      evalAt(TWO_MOTIF_FEN, 0, TWO_MOTIF_LINES),
      evalAt(TWO_MOTIF_FEN, 1, []),
      evalAt(TWO_MOTIF_DEFUSED_FEN, 2, TWO_MOTIF_LINES)
    ];

    expect(outcomeAt(allMoves, evals)?.defused.sort()).toEqual(['fork', 'freePiece']);
  });

  test('a threat only in a line the opponent would never play is not a threat', () => {
    const losingFork: PositionAnalysisLine = { ...FORK_LINE, cp: -300 };
    const evals: EngineEval[] = [
      evalAt(FORK_FEN, 0, [{ ...QUIET_LINE, cp: 200 }, losingFork]),
      evalAt(FORK_FEN_BLACK_TO_MOVE, 1, []),
      evalAt(FORK_FEN, 2, [FORK_LINE])
    ];

    expect(outcomeAt(faced(FORK_FEN), evals)?.preventable).toEqual([]);
  });

  test('the first move, or a missing eval, has no scans', () => {
    const allMoves = faced(ROOK_MOVED_AWAY_FEN);
    const scansFor = createPreventionScans(allMoves, [evalAt(FORK_FEN, 0, [FORK_LINE])]);

    expect(scansFor(allMoves[0]!)).toBeNull();
    expect(scansFor(allMoves[1]!)).toBeNull();
  });

  test('scans nothing until asked, then each position once', () => {
    const fens = [FORK_FEN, FORK_FEN_BLACK_TO_MOVE, FORK_FEN, FORK_FEN_BLACK_TO_MOVE, FORK_FEN];
    const allMoves = fens.slice(0, -1).map((fen, index) =>
      move({ ply: index + 1, mover: index % 2 === 0 ? 'white' : 'black', fenBefore: fen, fenAfter: fens[index + 1] })
    );
    const evals = fens.map((fen, ply) => evalAt(fen, ply, [QUIET_LINE]));
    const scanned: number[] = [];
    const scansFor = createPreventionScans(allMoves, evals, (index) => scanned.push(index));

    expect(scanned).toEqual([]);
    scansFor(allMoves[1]!);
    scansFor(allMoves[3]!);
    // Ply 4's "before" (evals[2]) is ply 2's "after": scanned once.
    expect(scanned).toEqual([0, 2, 4]);
  });
});
