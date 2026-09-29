import { describe, expect, test } from 'vitest';
import type { ClassifiedMove } from './classify.js';
import { buildCourseNodeFacts } from './course-dossier-node.js';
import { tacticOpportunityReason } from './tactic-reason-text.js';

// Réti–Tartakower after 8…Nxe4: 9.Qd8+ sacrifices the queen for mate.
const FEN = 'rnb1kb1r/ppp2ppp/8/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 9';

function facts(type: 'defendsHangingPiece' | 'fork' | 'checkmate', san: string, gain?: { kind: 'mate' | 'material'; pawns: number; prize: string | null }) {
  const move = {
    quality: 'great',
    mover: 'white',
    evalAfterCp: null,
    bestMoveSan: san,
    bestLineSan: [san],
    tacticOpportunity: { type, found: true, isUserMove: true, detail: 'saves the bishop on d2', confidence: 1, gain }
  } as unknown as ClassifiedMove;
  const node = { id: 'n17', parentId: 'n16', san, fenAfter: FEN, lineId: 'l1', comment: null } as never;
  return buildCourseNodeFacts({ node, move, fenBefore: FEN, linePositionFens: [FEN], evalsByFen: new Map(), critical: true, learnerSide: 'white' });
}

describe('course tactic sentences', () => {
  test('a defensive motif never reads on a check or a mate', () => {
    expect(facts('defendsHangingPiece', 'Qd8+').tactics).toEqual([]);
    expect(facts('defendsHangingPiece', 'Qd8+').motif).toBeNull();
    expect(facts('defendsHangingPiece', 'Bf4').tactics).toHaveLength(1);
    expect(facts('fork', 'Qd8+').motif).toBe('fork');
  });

  test('on a mate, only a sentence about the mate', () => {
    expect(facts('checkmate', 'Bd8#', { kind: 'material', pawns: 3, prize: 'knight' }).tactics).toEqual([]);
    expect(facts('checkmate', 'Bd8#').tactics).toEqual([]);
    expect(facts('checkmate', 'Bd8#', { kind: 'mate', pawns: 0, prize: null }).tactics).toHaveLength(1);
  });

  test('a mate through checkmate reads "forced mate", once', () => {
    expect(tacticOpportunityReason({ type: 'checkmate', found: true, isUserMove: true, gain: { kind: 'mate', pawns: 0, prize: null } }, 'Nf7+')).toBe('You forced mate.');
  });
});
