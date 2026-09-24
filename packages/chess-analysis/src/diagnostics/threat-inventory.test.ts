import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildPlyDiagnosticContext, type PlyDiagnosticContext } from './context.js';
import {
  opponentThreatsAfter,
  opponentThreatsBefore,
  realizedThreats,
  refutationCostsMaterial,
  refutationWinsOn,
  threatsOn,
  walkedRefutation
} from './threat-inventory.js';

interface Fixture {
  fenBefore: string;
  moveSan: string;
  fenAfter: string;
}

/** White plays Qd5 into the e6 pawn: exd5 wins the queen outright. */
const HANGING_QUEEN: Fixture = {
  fenBefore: '4k3/8/4p3/8/8/8/8/3QK3 w - - 0 1',
  moveSan: 'Qd5',
  fenAfter: '4k3/8/4p3/3Q4/8/8/8/4K3 b - - 0 1'
};
/** White plays Nd5, defended by c4: Nxd5 cxd5 is an even trade. */
const DEFENDED_KNIGHT: Fixture = {
  fenBefore: '4k3/8/5n2/8/2P5/2N5/8/4K3 w - - 0 1',
  moveSan: 'Nd5',
  fenAfter: '4k3/8/5n2/3N4/2P5/8/8/4K3 b - - 0 1'
};
/** White plays Kg1 with no luft: Ra1# is mate; Ra2 only attacks a defended pawn. */
const BACK_RANK: Fixture = {
  fenBefore: 'r5k1/5ppp/8/8/8/8/5PPP/7K w - - 0 1',
  moveSan: 'Kg1',
  fenAfter: 'r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1'
};
/** Re1+ is a check the king simply takes. */
const HARMLESS_CHECK: Fixture = {
  fenBefore: '4r1k1/8/8/8/8/8/8/7K w - - 0 1',
  moveSan: 'Kg1',
  fenAfter: '4r1k1/8/8/8/8/8/8/6K1 b - - 0 1'
};
/** Nf3+ forks the king and the h2 queen from a square nothing covers. */
const FORKING_CHECK: Fixture = {
  fenBefore: '6k1/8/8/4n3/8/8/7Q/7K w - - 0 1',
  moveSan: 'Kg1',
  fenAfter: '6k1/8/8/4n3/8/8/7Q/6K1 b - - 0 1'
};
/** White plays Nd4 and ...e5 attacks the undefended knight from a safe square. */
const PAWN_THREAT: Fixture = {
  fenBefore: '4k3/8/4p3/8/8/1N6/8/4K3 w - - 0 1',
  moveSan: 'Nd4',
  fenAfter: '4k3/8/4p3/8/3N4/8/8/4K3 b - - 0 1'
};
/** White is in check before the move, so no null move exists. */
const IN_CHECK: Fixture = {
  fenBefore: '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1',
  moveSan: 'Kxe2',
  fenAfter: '4k3/8/8/8/8/8/4K3/8 b - - 0 1'
};
/** The queen already stands on d5 before White's (irrelevant) king move. */
const QUEEN_ALREADY_HANGING: Fixture = {
  fenBefore: '4k3/8/4p3/3Q4/8/8/8/4K3 w - - 0 1',
  moveSan: 'Kd2',
  fenAfter: '4k3/8/4p3/3Q4/8/8/3K4/8 b - - 0 1'
};

function contextFor(fixture: Fixture, overrides: Partial<ClassifiedMoveDto> = {}, refutation?: string[]): PlyDiagnosticContext {
  const move: ClassifiedMoveDto = {
    ply: 1,
    moveSan: fixture.moveSan,
    mover: 'white',
    isUserMove: true,
    cpLoss: 900,
    quality: 'blunder',
    bestLineSan: [],
    evalAfterCp: -900,
    hangsPiece: false,
    fenBefore: fixture.fenBefore,
    fenAfter: fixture.fenAfter,
    cpBefore: 0,
    cpAfter: -900,
    ...overrides
  };
  const nextMoves = refutation ? [{ ...move, ply: 2, mover: 'black' as const, bestLinePvSan: refutation }] : undefined;
  const ctx = buildPlyDiagnosticContext(move, { nextMoves });
  if (!ctx) throw new Error('fixture must build a context');
  return ctx;
}

describe('opponentThreatsAfter', () => {
  test('a hanging queen is a dangerous capture', () => {
    expect(opponentThreatsAfter(contextFor(HANGING_QUEEN), 'capture')).toEqual([
      { kind: 'capture', moveSan: 'exd5', target: 'd5' }
    ]);
  });

  test('a defended piece is not a dangerous capture', () => {
    expect(opponentThreatsAfter(contextFor(DEFENDED_KNIGHT), 'capture')).toEqual([]);
  });

  test('a mating check is dangerous and targets the king', () => {
    expect(opponentThreatsAfter(contextFor(BACK_RANK), 'check')).toEqual([
      { kind: 'check', moveSan: 'Ra1#', target: 'g1' }
    ]);
  });

  test('a check that forks the queen is dangerous; one the king takes is not', () => {
    expect(opponentThreatsAfter(contextFor(FORKING_CHECK), 'check')).toEqual([
      { kind: 'check', moveSan: 'Nf3+', target: 'g1' }
    ]);
    expect(opponentThreatsAfter(contextFor(HARMLESS_CHECK), 'check')).toEqual([]);
  });

  test('a quiet threat on an undefended piece is dangerous; one on a defended pawn is not', () => {
    expect(opponentThreatsAfter(contextFor(PAWN_THREAT), 'threat')).toEqual([
      { kind: 'threat', moveSan: 'e5', target: 'd4' }
    ]);
    expect(opponentThreatsAfter(contextFor(BACK_RANK), 'threat')).toEqual([]);
  });
});

describe('opponentThreatsBefore', () => {
  test('sees what the opponent threatened before the move', () => {
    expect(opponentThreatsBefore(contextFor(QUEEN_ALREADY_HANGING), 'capture')).toEqual([
      { kind: 'capture', moveSan: 'exd5', target: 'd5' }
    ]);
  });

  test('is empty when the mover was in check (no null move)', () => {
    expect(opponentThreatsBefore(contextFor(IN_CHECK), 'capture')).toEqual([]);
    expect(opponentThreatsBefore(contextFor(IN_CHECK), 'check')).toEqual([]);
  });
});

describe('realizedThreats', () => {
  test('without a refutation line the static danger is enough once the loss is confirmed', () => {
    const ctx = contextFor(HANGING_QUEEN);
    expect(realizedThreats(ctx, opponentThreatsAfter(ctx, 'capture'))).toHaveLength(1);
  });

  test('no loss, no realised threat (compensated)', () => {
    const ctx = contextFor(HANGING_QUEEN, { cpAfter: -10 });
    expect(realizedThreats(ctx, opponentThreatsAfter(ctx, 'capture'))).toEqual([]);
  });

  test('kept when the refutation plays the threat or captures on its target later', () => {
    const direct = contextFor(HANGING_QUEEN, {}, ['exd5']);
    const later = contextFor(HANGING_QUEEN, {}, ['Kf7', 'Kd2', 'exd5']);

    expect(realizedThreats(direct, opponentThreatsAfter(direct, 'capture'))).toHaveLength(1);
    expect(realizedThreats(later, opponentThreatsAfter(later, 'capture'))).toHaveLength(1);
  });

  test('dropped when the refutation line never touches the threat', () => {
    const ctx = contextFor(HANGING_QUEEN, {}, ['Kf7', 'Qd7+']);
    expect(realizedThreats(ctx, opponentThreatsAfter(ctx, 'capture'))).toEqual([]);
  });

  test('a check is realised when the refutation line mates', () => {
    const ctx = contextFor(BACK_RANK, { cpAfter: -1970 }, ['h6', 'Kh1', 'Ra1#']);
    expect(realizedThreats(ctx, opponentThreatsAfter(ctx, 'check'))).toHaveLength(1);
  });
});

describe('threatsOn', () => {
  test('keeps only the threats landing on the given squares', () => {
    const threats = opponentThreatsAfter(contextFor(HANGING_QUEEN), 'capture');
    expect(threatsOn(threats, ['d5'])).toHaveLength(1);
    expect(threatsOn(threats, ['a1', 'e1'])).toEqual([]);
  });
});

describe('walkedRefutation / refutationWinsOn', () => {
  test('null without a refutation line', () => {
    expect(walkedRefutation(contextFor(HANGING_QUEEN))).toBeNull();
  });

  test('wins on a square when the opponent captures there and the material stays lost', () => {
    const ctx = contextFor(HANGING_QUEEN, {}, ['Kf7', 'Kd2', 'exd5']);
    const walked = walkedRefutation(ctx) ?? [];
    expect(walked).toHaveLength(3);
    expect(refutationWinsOn(ctx, walked, 'd5')).toBe(true);
    expect(refutationWinsOn(ctx, walked, 'e6')).toBe(false);
  });

  test('a capture by the mover inside the line does not count', () => {
    const ctx = contextFor(HANGING_QUEEN, {}, ['Kf7', 'Qxe6+']);
    expect(refutationWinsOn(ctx, walkedRefutation(ctx) ?? [], 'e6')).toBe(false);
  });

  test('an even exchange is not a win: the knight on d5 is taken and retaken', () => {
    const ctx = contextFor(DEFENDED_KNIGHT, {}, ['Nxd5', 'cxd5']);
    const walked = walkedRefutation(ctx) ?? [];
    expect(refutationWinsOn(ctx, walked, 'd5')).toBe(false);
    expect(refutationCostsMaterial(ctx, walked)).toBe(false);
  });

  test('a mate in the line costs the game whatever the material', () => {
    const ctx = contextFor(BACK_RANK, {}, ['Ra1#']);
    expect(refutationCostsMaterial(ctx, walkedRefutation(ctx) ?? [])).toBe(true);
  });
});
