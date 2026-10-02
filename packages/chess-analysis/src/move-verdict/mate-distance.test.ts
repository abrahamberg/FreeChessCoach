import { describe, expect, test } from 'vitest';
import { tacticCardTexts } from '../review-move-texts.js';
import { decideMoveVerdict } from './index.js';
import { BAIT_ROOK_FEN, MATE_OR_QUEEN_FEN, scenario } from './verdict-test-fixtures.js';

/** Ra7 Kg8 Rb8# is mate in 2. */
const LADDER_FEN = '7k/8/8/8/8/8/R7/1R4K1 w - - 0 1';
/** Qc4+ wins the rook on a2; Qf4 leaves Rb1+ Qf1 Rxf1#. */
const BACK_RANK_IN_TWO_FEN = '1r4k1/8/8/8/8/8/r7/2Q4K w - - 0 1';

/** The verdict's card and the sentence Game Review prints for it. */
function carded(input: Parameters<typeof decideMoveVerdict>[0]) {
  const { detail: _detail, ...card } = decideMoveVerdict(input)?.card ?? { detail: null };
  const bestMoveSan = input.evals[input.move.ply - 1]?.lines[0]?.moveSan;
  const texts = tacticCardTexts({ ...input.move, ...(bestMoveSan ? { bestMoveSan } : {}), ...card });
  return { card, text: texts.opportunity ?? texts.allowed ?? '' };
}

/**
 * The owner's calibration (2026-10-01): 24…Qxh3 read "They forced mate."
 * with mate in 6 before the move and mate in 5 after it. `gain.mateIn`
 * counts from the card's own move; the sentence says the number a player
 * would: after a move that was played, from a move that was not.
 */
describe('a mate card carries the engine line\'s mate distance', () => {
  test('a move that keeps a forced mate: the distance after it', () => {
    const { card, text } = carded(scenario({
      fen: LADDER_FEN,
      moveSan: 'Ra7',
      quality: 'best',
      before: [[['Ra7', 'Kg8', 'Rb8#'], { mate: 2 }], [['Kf2', 'Kg8'], 900]],
      after: [[['Kg8', 'Rb8#'], { mate: 1 }]]
    }));

    expect(card.tacticOpportunity).toMatchObject({ found: true, gain: { kind: 'mate', mateIn: 2 } });
    expect(text).toMatch(/\b1\b/);
    expect(text).not.toMatch(/\b2\b|two/);
  });

  test('a missed mate: the distance from the move the card names', () => {
    const { card, text } = carded(scenario({
      fen: LADDER_FEN,
      moveSan: 'Kf2',
      quality: 'miss',
      before: [[['Ra7', 'Kg8', 'Rb8#'], { mate: 2 }], [['Kf2', 'Kg8'], 900]],
      after: [[['Kg8', 'Ra7'], 900]]
    }));

    expect(card.tacticOpportunity).toMatchObject({ found: false, gain: { kind: 'mate', mateIn: 2 } });
    expect(text).toMatch(/\b2\b.*Ra7/);
  });

  test('an allowed mate: the distance from the reply the card names', () => {
    const { card, text } = carded(scenario({
      fen: BACK_RANK_IN_TWO_FEN,
      moveSan: 'Qf4',
      quality: 'blunder',
      before: [[['Qc4+', 'Kh8', 'Qxa2'], 400], [['Qg5+', 'Kh8'], 0]],
      after: [[['Rb1+', 'Qf1', 'Rxf1#'], { mate: -2 }]],
      withNext: true
    }));

    expect(card.tacticAllowed).toMatchObject({ byMoveSan: 'Rb1+', gain: { kind: 'mate', mateIn: 2 } });
    expect(text).toMatch(/\b2\b.*Rb1\+/);
  });

  test('a move that is itself checkmate has nothing to count', () => {
    const missed = carded(scenario({
      fen: MATE_OR_QUEEN_FEN,
      moveSan: 'Qe2',
      quality: 'miss',
      before: [[['Re8#'], { mate: 1 }], [['Qe2', 'h6', 'Qe8+', 'Kh7'], 1400]],
      after: [[['h6', 'Qe8+', 'Kh7'], 1400]]
    }));
    const allowed = carded(scenario({
      fen: BAIT_ROOK_FEN,
      moveSan: 'Qxa4',
      quality: 'blunder',
      before: [[['g3', 'Rae4', 'Kg2'], -100], [['h3'], -110]],
      after: [[['Re1#'], { mate: -1 }]],
      withNext: true
    }));

    expect(missed.card.tacticOpportunity?.gain).toMatchObject({ kind: 'mate', mateIn: 1 });
    expect(allowed.card.tacticAllowed?.gain).toMatchObject({ kind: 'mate', mateIn: 1 });
    // The mating move is named, with no number of moves (a square's digit
    // is not a word of its own).
    expect(missed.text).toContain('Re8#');
    expect(allowed.text).toContain('Re1#');
    for (const { text } of [missed, allowed]) expect(text).not.toMatch(/\b\d+\b/);
  });

  test('24…Qxh3, mate in 10 off the depth-12 search with mate in 5 on the board: the card carries no number', () => {
    const { card, text } = carded(scenario({
      fen: '1k4r1/ppp3r1/2n4p/2P5/5p1q/P2P1P1B/1P3QP1/R4RK1 b - - 2 24',
      moveSan: 'Qxh3',
      quality: 'great',
      before: [[['Qxh3', 'Qg3', 'Rxg3', 'Kf2', 'Qxg2+', 'Ke1', 'Qxf1+', 'Kd2'], { mate: -11 }], [['Rg3', 'Be6'], -470], [['Qd8', 'Rfe1'], -201]],
      after: [[['Qg3', 'Rxg3', 'Kf2', 'Qxg2+', 'Ke1', 'Qxf1+', 'Kd2', 'Rg2+'], { mate: -10 }], [['Rfb1', 'Rxg2+', 'Kf1', 'Qh1+'], { mate: -4 }]]
    }));

    expect(card.tacticOpportunity).toMatchObject({ found: true, gain: { kind: 'mate' } });
    expect(card.tacticOpportunity?.gain?.mateIn).toBeUndefined();
    expect(text).toMatch(/mate/);
    expect(text).not.toMatch(/\d/);
  });

  test('a missed or an allowed mate too long for its search: the move is named, the count is not', () => {
    const missed = carded(scenario({
      fen: LADDER_FEN,
      moveSan: 'Kf2',
      quality: 'miss',
      before: [[['Ra7', 'Kg8', 'Rb8#'], { mate: 6 }], [['Kf2', 'Kg8'], 900]],
      after: [[['Kg8', 'Ra7'], 900]]
    }));
    expect(missed.card.tacticOpportunity?.gain).toMatchObject({ kind: 'mate' });
    expect(missed.card.tacticOpportunity?.gain?.mateIn).toBeUndefined();
    expect(missed.text).toContain('Ra7');
    expect(missed.text.replace('Ra7', '')).not.toMatch(/\d/);
  });

  test('no mate distance on the engine line: the sentence keeps no number', () => {
    const texts = tacticCardTexts({
      ply: 1, moveSan: 'Ra7', mover: 'white', isUserMove: true, cpLoss: 0, quality: 'best', bestLineSan: [], evalAfterCp: 0, hangsPiece: false,
      tacticOpportunity: { type: 'checkmate', found: true, gain: { kind: 'mate', pawns: 0, prize: null } }
    });
    expect(texts.opportunity).not.toMatch(/\b\d+\b/);
  });
});
