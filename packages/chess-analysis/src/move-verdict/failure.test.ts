import { describe, expect, test } from 'vitest';
import { countingVerdictDeps, decideMoveVerdict, type VerdictReason } from './index.js';
import {
  BAIT_ROOK_FEN,
  BISHOP_FORK_FEN,
  MATE_OR_QUEEN_FEN,
  QUEEN_FOR_KNIGHT_FEN,
  ROOK_FORK_FEN,
  scenario
} from './verdict-test-fixtures.js';

/** Runs the verdict with counters, recording which checks ran in order. */
function decide(input: Parameters<typeof decideMoveVerdict>[0]) {
  const checked: VerdictReason[] = [];
  const { deps, counters } = countingVerdictDeps();
  const verdict = decideMoveVerdict(input, { ...deps, onCheck: (reason) => checked.push(reason) });
  return { verdict, checked, counters };
}

describe('decideMoveVerdict — failures', () => {
  test('rescued the queen but missed mate: missedMate, and the allowed check never runs', () => {
    const input = scenario({
      fen: MATE_OR_QUEEN_FEN,
      moveSan: 'Qe2',
      quality: 'miss',
      before: [[['Re8#'], { mate: 1 }], [['Qe2', 'h6', 'Qe8+', 'Kh7'], 1400]],
      after: [[['h6', 'Qe8+', 'Kh7'], 1400]],
      withNext: true
    });
    const { verdict, checked, counters } = decide(input);

    expect(verdict).toMatchObject({ kind: 'failure', reason: 'missedMate', card: { tacticOpportunity: { type: 'checkmate', found: false } } });
    expect(checked).toEqual(['missedMate']);
    // Only the move's own chance was classified — never the reply's.
    expect(counters.tacticChances).toBe(1);
  });

  test('hung a piece while the best move was quiet: allowedTactic', () => {
    const input = scenario({
      fen: '4k3/1r6/8/8/8/2N5/8/K7 w - - 0 1',
      moveSan: 'Nb5',
      quality: 'blunder',
      before: [[['Ka2', 'Kd7', 'Ka3'], -200], [['Nd5'], -210]],
      after: [[['Rxb5', 'Ka2', 'Rb4'], -900]],
      withNext: true
    });
    const { verdict, checked } = decide(input);

    expect(verdict).toMatchObject({
      kind: 'failure',
      reason: 'allowedTactic',
      explainedCpWhite: -300,
      lostPawns: 3,
      card: { tacticAllowed: { type: 'freePiece', byMoveSan: 'Rxb5' } }
    });
    // The best line wins nothing, so a miss there could only be positional
    // (tier 2): never checked once the knight loss is confirmed.
    expect(checked).toEqual(['allowedTactic']);
  });

  test('missed a rook fork and hung a knight: the bigger miss is the reason', () => {
    const input = scenario({
      fen: ROOK_FORK_FEN,
      moveSan: 'Nb6',
      quality: 'blunder',
      before: [[['Nd6+', 'Kd7', 'Nxb7'], 500], [['Ka2'], -200]],
      after: [[['Rxb6', 'Ka2', 'Rb4'], -900]],
      withNext: true
    });
    const { verdict, checked } = decide(input);

    expect(verdict).toMatchObject({ kind: 'failure', reason: 'missedTactic', explainedCpWhite: -500, card: { tacticOpportunity: { type: 'fork', found: false } } });
    expect(verdict?.card.tacticAllowed).toBeUndefined();
    // gap(B, max(R, P)) = 500 confirmed ≥ the knight's 300 ceiling: stop.
    expect(checked).toEqual(['missedTactic']);
  });

  test('missed a bishop fork and hung the queen: the bigger loss is the reason', () => {
    const { verdict } = decide(bishopForkQueenHung());

    expect(verdict).toMatchObject({ kind: 'failure', reason: 'allowedTactic', explainedCpWhite: -900, lostPawns: 9 });
    expect(verdict?.card.tacticAllowed).toMatchObject({ type: 'freePiece', gain: { kind: 'material', pawns: 9 } });
    expect(verdict?.card.tacticOpportunity).toBeUndefined();
  });

  test('a queen loss confirmed first: the smaller checks never run', () => {
    const { checked, counters } = decide(bishopForkQueenHung());

    expect(checked).toEqual(['allowedTactic']);
    // The reply's chance ran; the move's own chance and the materiality
    // witness (line R) never did.
    expect(counters.tacticChances).toBe(1);
    expect(counters.referenceLines).toBe(0);
  });

  test('won a knight but the refutation takes the queen: one failure, the knight in the detail', () => {
    const input = scenario({
      fen: QUEEN_FOR_KNIGHT_FEN,
      moveSan: 'Nxc6',
      quality: 'blunder',
      before: [[['Qf3'], 400], [['Qe2'], 380]],
      after: [[['Rxd1', 'Ne7+', 'Kf8'], -200]],
      withNext: true
    });
    const { verdict, checked } = decide(input);

    expect(verdict).toMatchObject({
      kind: 'failure',
      reason: 'allowedTactic',
      gainedPawns: 3,
      lostPawns: 9,
      card: { detail: 'won a knight, but it cost the queen', tacticAllowed: { type: 'freePiece', byMoveSan: 'Rxd1' } }
    });
    // The knight capture reads as a found freePiece on its own, which is
    // not a miss and, in a failure, not a card either.
    expect(verdict?.card.tacticOpportunity).toBeUndefined();
    // Qf3 wins nothing: the miss is tier 2 and never checked.
    expect(checked).toEqual(['allowedTactic']);
  });

  test('"won" a rook as bait while the eval drops: no foundTactic, the mate it allowed instead', () => {
    const input = scenario({
      fen: BAIT_ROOK_FEN,
      moveSan: 'Qxa4',
      quality: 'blunder',
      before: [[['g3', 'Rae4', 'Kg2'], -100], [['h3'], -110]],
      after: [[['Re1#'], { mate: -1 }]],
      withNext: true
    });
    const { verdict, checked } = decide(input);

    expect(verdict).toMatchObject({ kind: 'failure', reason: 'allowedMate', card: { detail: 'won a rook, but it allowed mate' } });
    expect(checked).toEqual(['allowedMate']);
  });
  test('with no mate or material reason, the positional miss is the verdict', () => {
    const input = scenario({
      fen: 'rnbqkb1r/ppp2ppp/3p1n2/4p3/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 0 4',
      moveSan: 'h3',
      quality: 'mistake',
      before: [[['Nf3', 'Nbd7', 'Rg1', 'h6', 'Be3', 'Ng4', 'Bd2'], 45]],
      after: [[['Nc6', 'd5', 'Nd4'], -84]],
      withNext: true
    });

    expect(decide(input).verdict).toMatchObject({ reason: 'missedTactic', card: { tacticOpportunity: { type: 'develops' } } });
  });

  // 07eb21d9, 4.Nd5?: the knight leaves e4 hanging. "Missed a chance to
  // develop with Nf3" claimed the whole gap (a positional motif has no
  // material cap) and outranked the pawn it lost.
  test('a positional miss never outranks the pawn the move hung', () => {
    const { verdict, checked } = decide(knightLeavesE4());

    // The refutation also trades Nxe7 Qxe7: 3 won, 4 lost, net one pawn.
    expect(verdict).toMatchObject({ kind: 'failure', reason: 'allowedTactic', gainedPawns: 3, lostPawns: 4 });
    // No detector names Nxe4 on this line (the verifier rejects a capture
    // whose knight then retreats), so the card is the material itself.
    expect(verdict?.card).toMatchObject({
      detail: null,
      tacticAllowed: { type: 'freePiece', byMoveSan: 'Nxe4', gain: { kind: 'material', pawns: 1, prize: 'pawn' } }
    });
    expect(verdict?.card.tacticOpportunity).toBeUndefined();
    // The positional miss is a tier-2 candidate: never checked once a
    // material reason is confirmed.
    expect(checked).toEqual(['allowedTactic']);
  });
});


function bishopForkQueenHung() {
  return scenario({
    fen: BISHOP_FORK_FEN,
    moveSan: 'Qd7+',
    quality: 'blunder',
    before: [[['Nd6+', 'Kd7', 'Nxb7'], 1400], [['Kb2'], 1100]],
    after: [[['Kxd7', 'Ne5+', 'Ke6'], 0]],
    withNext: true
  });
}

function knightLeavesE4() {
  return scenario({
    fen: 'rnbqkb1r/ppp2ppp/3p1n2/4p3/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 0 4',
    moveSan: 'Nd5',
    quality: 'mistake',
    before: [[['Nf3', 'Nbd7', 'Rg1', 'h6', 'Be3', 'Ng4', 'Bd2'], 45]],
    after: [[['Nxe4', 'Qd3', 'Nf6', 'Bg5', 'Be7', 'Nxe7', 'Qxe7'], -84]],
    withNext: true
  });
}
