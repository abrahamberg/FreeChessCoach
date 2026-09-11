import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import type { DiagnosticDetector, DiagnosticObservation } from '@freechesscoach/chess-analysis';
import { describe, expect, test } from 'vitest';
import { buildDiagnosticObservations, type BuildDiagnosticsInput } from './build-diagnostics.js';

const FEN_A = '3qk3/8/8/6Q1/8/1R6/8/4K3 b - - 0 1';
const FEN_B = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

function move(ply: number, mover: 'white' | 'black', overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply,
    moveSan: 'Kd1',
    mover,
    isUserMove: mover === 'white',
    cpLoss: 0,
    quality: 'best',
    bestLineSan: ['Kd1'],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore: FEN_A,
    fenAfter: FEN_B,
    winPctBefore: 60,
    winPctAfter: 50,
    ...overrides
  };
}

function detector(
  code: DiagnosticDetector['code'],
  direction: DiagnosticDetector['direction'],
  priority: number,
  detect: DiagnosticDetector['detect']
): DiagnosticDetector {
  return { code, direction, priority, detect };
}

function observation(overrides: Partial<DiagnosticObservation> = {}): DiagnosticObservation {
  return {
    code: 'BV-01',
    direction: 'D',
    ply: 1,
    failed: true,
    hwdl: 0.1,
    severity: 'minor',
    reachability: 0.8,
    detail: 'missed something',
    ...overrides
  };
}

function baseInput(overrides: Partial<BuildDiagnosticsInput> = {}): BuildDiagnosticsInput {
  return {
    gameId: 'game-1',
    userId: 'user-1',
    userColor: 'white',
    pgn: '1. e4 e5 *',
    moves: [move(1, 'white'), move(2, 'black')],
    evals: [],
    diagnosticByPly: new Map(),
    ...overrides
  };
}

describe('buildDiagnosticObservations', () => {
  test('only the user colour produces observations', () => {
    const always = detector('BV-01', 'D', 10, (ctx) => observation({ ply: ctx.ply }));

    const rows = buildDiagnosticObservations(baseInput(), [always]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.ply).toBe(1);
  });

  test('a throwing detector does not stop other detectors on the same ply', () => {
    const throwing = detector('BV-01', 'D', 10, () => {
      throw new Error('boom');
    });
    const working = detector('MS-01', 'D', 20, (ctx) => observation({ code: 'MS-01', ply: ctx.ply }));

    const rows = buildDiagnosticObservations(baseInput(), [throwing, working]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.code).toBe('MS-01');
  });

  test('a throwing detector does not stop the rest of the game', () => {
    const throwing = detector('BV-01', 'D', 10, (ctx) => {
      if (ctx.ply === 1) throw new Error('boom');
      return observation({ code: 'BV-01', ply: ctx.ply });
    });
    const input = baseInput({ moves: [move(1, 'white'), move(3, 'white', { winPctBefore: 60, winPctAfter: 20 })] });

    const rows = buildDiagnosticObservations(input, [throwing]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.ply).toBe(3);
  });

  test('two failed observations on the same ply collapse to one primary row (episode resolution)', () => {
    const upstream = detector('BV-01', 'D', 10, (ctx) => observation({ code: 'BV-01', ply: ctx.ply }));
    const downstream = detector('TA-07', 'D', 20, (ctx) => observation({ code: 'TA-07', ply: ctx.ply }));

    const rows = buildDiagnosticObservations(baseInput(), [upstream, downstream]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.code).toBe('BV-01');
  });

  test('a non-failed observation is persisted as its own row, independent of episode resolution', () => {
    const success = detector('BV-01', 'D', 10, (ctx) => observation({ ply: ctx.ply, failed: false, hwdl: 0 }));

    const rows = buildDiagnosticObservations(baseInput(), [success]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.failed).toBe(false);
  });

  // 0032_annotated_pgn.ts: the detector's own `detail` text is no longer
  // persisted onto the row — a thin (gameId, ply) pointer now, with detail
  // derivable on demand from the game's own annotatedPgn instead of
  // snapshotted redundantly at write time (see toRow's doc comment).
  test('maps observation fields onto the persisted row, including gameId/userId', () => {
    const always = detector('BV-01', 'D', 10, (ctx) =>
      observation({ ply: ctx.ply, hwdl: 0.42, severity: 'major', reachability: 0.3, detail: 'missed Nd6+' })
    );

    const rows = buildDiagnosticObservations(baseInput(), [always]);

    expect(rows[0]).toMatchObject({
      gameId: 'game-1',
      userId: 'user-1',
      code: 'BV-01',
      direction: 'D',
      failed: true,
      hwdl: 0.42,
      severity: 'major',
      reachability: 0.3
    });
    expect(rows[0]).not.toHaveProperty('detail');
  });
});
