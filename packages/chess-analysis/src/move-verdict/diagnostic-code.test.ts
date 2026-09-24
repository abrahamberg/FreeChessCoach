import { Chess } from 'chess.js';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { verdictDiagnosticCode } from './diagnostic-code.js';
import type { MoveVerdict, MoveVerdictCard } from './types.js';

function moveFrom(fen: string, san: string, overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  const board = new Chess(fen);
  const played = board.move(san);
  return {
    ply: 1,
    moveSan: played.san,
    uci: `${played.from}${played.to}`,
    mover: played.color === 'w' ? 'white' : 'black',
    isUserMove: true,
    quality: 'mistake',
    cpLoss: 0,
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore: fen,
    fenAfter: board.fen(),
    ...overrides
  };
}

function verdict(kind: MoveVerdict['kind'], reason: MoveVerdict['reason'], card: Omit<MoveVerdictCard, 'detail'>): MoveVerdict {
  return { kind, reason, explainedCpWhite: 0, gainedPawns: 0, lostPawns: 0, card: { ...card, detail: null } };
}

const NOTHING_HANGING = { hangingPieces: [] };
const allowed = (type: 'freePiece' | 'skewer' | 'other', byMoveSan: string) =>
  ({ tacticAllowed: { type, detail: null, visual: null, byMoveSan } }) as const;

describe('verdictDiagnosticCode', () => {
  test('a missed named tactic maps through motifToCode, offensive', () => {
    const move = moveFrom('4k3/8/8/8/8/8/8/K6R w - - 0 1', 'Kb1', { bestMoveSan: 'Rh8+' });
    const card = { tacticOpportunity: { type: 'skewer' as const, found: false, detail: null, visual: null, embodiedBySan: 'Rh8+' } };
    expect(verdictDiagnosticCode(verdict('failure', 'missedTactic', card), move, NOTHING_HANGING)).toEqual({ code: 'TA-14', direction: 'O' });
  });

  test('a missed free capture of a hanging piece is BV-02, not TA-43', () => {
    const fen = '4k3/8/8/3n4/8/8/8/K2R4 w - - 0 1';
    const move = moveFrom(fen, 'Kb1', { bestMoveSan: 'Rxd5' });
    const card = { tacticOpportunity: { type: 'freePiece' as const, found: false, detail: null, visual: null, embodiedBySan: 'Rxd5' } };
    const hanging = { hangingPieces: [{ square: 'd5', piece: 'n' as const, color: 'black' as const, attackers: 1, defenders: 0 }] };
    expect(verdictDiagnosticCode(verdict('failure', 'missedTactic', card), move, hanging)).toEqual({ code: 'BV-02', direction: 'O' });
  });

  test('an allowed capture of the moved piece is BV-15', () => {
    const move = moveFrom('4k3/8/2p5/8/8/8/8/K2R4 w - - 0 1', 'Rd5');
    expect(verdictDiagnosticCode(verdict('failure', 'allowedTactic', allowed('freePiece', 'cxd5')), move, NOTHING_HANGING)).toEqual({
      code: 'BV-15',
      direction: 'B'
    });
  });

  test('an allowed capture of a piece already hanging is BV-01; of another, MS-02', () => {
    const move = moveFrom('4k3/8/2p5/3N4/8/8/8/K7 w - - 0 1', 'Kb1');
    const hanging = { hangingPieces: [{ square: 'd5', piece: 'n' as const, color: 'white' as const, attackers: 1, defenders: 0 }] };
    const card = allowed('freePiece', 'cxd5');
    expect(verdictDiagnosticCode(verdict('failure', 'allowedTactic', card), move, hanging)).toEqual({ code: 'BV-01', direction: 'D' });
    expect(verdictDiagnosticCode(verdict('failure', 'allowedTactic', card), move, NOTHING_HANGING)).toEqual({ code: 'MS-02', direction: 'D' });
  });

  test('an allowed check is MS-01, a quiet threat MS-03', () => {
    const move = moveFrom('4k3/8/8/8/8/8/8/K6r w - - 0 1', 'Ka2');
    expect(verdictDiagnosticCode(verdict('failure', 'allowedTactic', allowed('other', 'Rh2+')), move, NOTHING_HANGING)).toEqual({
      code: 'MS-01',
      direction: 'D'
    });
    expect(verdictDiagnosticCode(verdict('failure', 'allowedTactic', allowed('other', 'Rh3')), move, NOTHING_HANGING)).toEqual({
      code: 'MS-03',
      direction: 'D'
    });
  });
});
