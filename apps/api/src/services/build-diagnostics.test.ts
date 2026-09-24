import type { DiagnosticDetector, MoveVerdict } from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test, vi } from 'vitest';
import { buildDiagnosticObservations } from './build-diagnostics.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const MOVE: ClassifiedMoveDto = {
  ply: 1,
  moveSan: 'e4',
  uci: 'e2e4',
  mover: 'white',
  isUserMove: true,
  quality: 'mistake',
  cpLoss: 200,
  bestLineSan: [],
  evalAfterCp: 0,
  hangsPiece: false,
  fenBefore: START,
  fenAfter: AFTER_E4,
  cpBefore: 300,
  cpAfter: 0,
  winPctBefore: 70,
  winPctAfter: 50,
  bestMoveSan: 'd4'
};

/** A missed skewer: TA-14, direction O. */
const MISSED_SKEWER: MoveVerdict = {
  kind: 'failure',
  reason: 'missedTactic',
  explainedCpWhite: -300,
  gainedPawns: 5,
  lostPawns: 0,
  card: {
    tacticOpportunity: { type: 'skewer', found: false, detail: 'the rook skewers the queen', visual: null, embodiedBySan: 'd4' },
    detail: null
  }
};

function detector(code: DiagnosticDetector['code'], direction: DiagnosticDetector['direction'], fires: boolean) {
  const detect = vi.fn((ctx: Parameters<DiagnosticDetector['detect']>[0]) =>
    fires
      ? { code, direction, ply: ctx.ply, failed: false, hwdl: 0, severity: 'minor' as const, reachability: 1, detail: 'detected' }
      : null
  );
  return { code, direction, priority: 10, detect } satisfies DiagnosticDetector;
}

function build(verdict: MoveVerdict | null, detectors: DiagnosticDetector[]) {
  return buildDiagnosticObservations(
    {
      gameId: 'g',
      userId: 'u',
      userColor: 'white',
      pgn: '1. e4',
      moves: [MOVE],
      evals: [],
      verdicts: new Map([[1, verdict]])
    },
    detectors
  );
}

// Task 77.5: at most one observation per ply, from the verdict.
describe('buildDiagnosticObservations', () => {
  test('a null verdict runs no detector and records nothing', () => {
    const anything = detector('MS-02', 'D', true);
    expect(build(null, [anything])).toEqual([]);
    expect(anything.detect).not.toHaveBeenCalled();
  });

  test("only the verdict's own code runs, and its failed flag is the verdict's", () => {
    const other = detector('MS-02', 'D', true);
    const skewer = detector('TA-14', 'O', true);

    const rows = build(MISSED_SKEWER, [other, skewer]);

    expect(other.detect).not.toHaveBeenCalled();
    expect(rows).toEqual([expect.objectContaining({ ply: 1, code: 'TA-14', direction: 'O', failed: true })]);
  });

  test("the verdict's code is recorded even when its detector finds nothing", () => {
    const rows = build({ ...MISSED_SKEWER, kind: 'credit', reason: 'foundTactic' }, [detector('TA-14', 'O', false)]);

    expect(rows).toEqual([expect.objectContaining({ code: 'TA-14', direction: 'O', failed: false })]);
  });
});
