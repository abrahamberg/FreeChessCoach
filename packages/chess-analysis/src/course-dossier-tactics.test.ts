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

  test('a fork by squares loses its detail, not its motif', () => {
    const move = {
      quality: 'great',
      mover: 'white',
      evalAfterCp: null,
      bestMoveSan: 'Nc6+',
      bestLineSan: ['Nc6+'],
      tacticOpportunity: { type: 'fork', found: true, isUserMove: true, detail: 'knight on c6 forks b8, d8 and a7', confidence: 1, gain: { kind: 'material', pawns: 9, prize: 'queen' } }
    } as unknown as ClassifiedMove;
    const node = { id: 'n9', parentId: 'n8', san: 'Nc6+', fenAfter: FEN, lineId: 'l1', comment: null } as never;
    const facts = buildCourseNodeFacts({ node, move, fenBefore: FEN, linePositionFens: [FEN], evalsByFen: new Map(), critical: true, learnerSide: 'white' });
    expect(facts.tactics).toEqual(['You won a queen through a fork.']);
  });

  test('a material sentence goes where the position is already a forced mate', () => {
    const move = {
      quality: 'great',
      mover: 'white',
      evalAfterCp: null,
      bestMoveSan: 'Nxg7+',
      bestLineSan: ['Nxg7+'],
      tacticOpportunity: { type: 'freePiece', found: true, isUserMove: true, detail: 'captures the pawn on g7', confidence: 1, gain: { kind: 'material', pawns: 1, prize: 'pawn' } }
    } as unknown as ClassifiedMove;
    const node = { id: 'n41', parentId: 'n40', san: 'Nxg7+', fenAfter: FEN, lineId: 'l1', comment: null } as never;
    const mate = new Map([[FEN, { ply: 0, fen: FEN, depth: 20, lines: [{ moveSan: 'Kd8', moveUci: '', cp: null, mateIn: 2 }] }]]);
    const build = (evalsByFen: typeof mate) => buildCourseNodeFacts({ node, move, fenBefore: FEN, linePositionFens: [FEN], evalsByFen, critical: true, learnerSide: 'white' });
    expect(build(mate).tactics).toEqual([]);
    expect(build(new Map()).tactics).toEqual(['You won a pawn through a free piece — captures the pawn on g7.']);
  });

  test('an endgame pawn push is no space gain', () => {
    const move = {
      quality: 'best',
      mover: 'white',
      evalAfterCp: null,
      bestMoveSan: 'e4',
      bestLineSan: ['e4'],
      tacticOpportunity: { type: 'spaceGain', found: true, isUserMove: true, detail: 'pushes a pawn to e4, taking space', confidence: 1 }
    };
    const node = { id: 'n3', parentId: 'n2', san: 'e4', fenAfter: FEN, lineId: 'l1', comment: null } as never;
    const build = (phase: string) => buildCourseNodeFacts({ node, move: { ...move, phase } as unknown as ClassifiedMove, fenBefore: FEN, linePositionFens: [FEN], evalsByFen: new Map(), critical: false, learnerSide: 'white' });
    expect(build('endgame').tactics).toEqual([]);
    expect(build('middlegame').tactics).toHaveLength(1);
    const deep = { id: 'n5', parentId: 'n4', san: 'f6', fenAfter: FEN, lineId: 'l1', comment: null } as never;
    expect(buildCourseNodeFacts({ node: deep, move: { ...move, phase: null } as unknown as ClassifiedMove, fenBefore: FEN, linePositionFens: [FEN], evalsByFen: new Map(), critical: false, learnerSide: 'white' }).tactics).toEqual([]);
  });

  test('a mate through checkmate reads "forced mate", once', () => {
    expect(tacticOpportunityReason({ type: 'checkmate', found: true, isUserMove: true, gain: { kind: 'mate', pawns: 0, prize: null } }, 'Nf7+')).toBe('You forced mate.');
  });
});
