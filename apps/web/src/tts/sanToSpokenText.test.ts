import { describe, expect, test } from 'vitest';
import { sanToSpokenWords, translateChessNotationForSpeech } from './sanToSpokenText.js';

describe('sanToSpokenWords', () => {
  test('translates a piece move', () => {
    expect(sanToSpokenWords('Qh5')).toBe('Queen h5');
  });

  test('translates a piece move with check', () => {
    expect(sanToSpokenWords('Qh5+')).toBe('Queen h5 check');
  });

  test('translates a piece capture with checkmate', () => {
    expect(sanToSpokenWords('Qxh5#')).toBe('Queen takes h5 checkmate');
  });

  test('translates a disambiguated knight move', () => {
    expect(sanToSpokenWords('Nbd7')).toBe('Knight from b d7');
  });

  test('translates a disambiguated capture', () => {
    expect(sanToSpokenWords('Nbxd7')).toBe('Knight from b takes d7');
  });

  test('translates a rook capture', () => {
    expect(sanToSpokenWords('Rxd5')).toBe('Rook takes d5');
  });

  test('translates a pawn capture', () => {
    expect(sanToSpokenWords('exd5')).toBe('e takes d5');
  });

  test('translates a pawn capture with check', () => {
    expect(sanToSpokenWords('exd5+')).toBe('e takes d5 check');
  });

  test('leaves a plain pawn move as the square, unchanged', () => {
    expect(sanToSpokenWords('a4')).toBe('a4');
  });

  test('translates a pawn promotion', () => {
    expect(sanToSpokenWords('e8=Q')).toBe('e8 promoting to Queen');
  });

  test('translates a pawn promotion with checkmate', () => {
    expect(sanToSpokenWords('e8=Q#')).toBe('e8 promoting to Queen checkmate');
  });

  test('translates a capture-promotion', () => {
    expect(sanToSpokenWords('exd8=Q+')).toBe('e takes d8 promoting to Queen check');
  });

  test('translates kingside castling', () => {
    expect(sanToSpokenWords('O-O')).toBe('castles kingside');
  });

  test('translates queenside castling', () => {
    expect(sanToSpokenWords('O-O-O')).toBe('castles queenside');
  });

  test('translates castling with check', () => {
    expect(sanToSpokenWords('O-O+')).toBe('castles kingside check');
  });

  test('falls back to the raw token for anything unrecognized, never throws', () => {
    expect(sanToSpokenWords('not-a-move')).toBe('not-a-move');
  });
});

describe('translateChessNotationForSpeech', () => {
  test("translates White's numbered move with no color marker", () => {
    expect(translateChessNotationForSpeech('24. a4 was the idea')).toBe('move 24, a4 was the idea');
  });

  test("translates Black's numbered move (ellipsis) with an explicit color marker", () => {
    expect(translateChessNotationForSpeech('after 26...c6')).toBe("after move 26, black's move, c6");
  });

  test('translates the coach\'s hyphenated move-number typo as White\'s move', () => {
    expect(translateChessNotationForSpeech('26- c6 next')).toBe('move 26, c6 next');
  });

  test('translates a numbered move whose SAN itself needs translating', () => {
    expect(translateChessNotationForSpeech('24. Qh5+ wins')).toBe('move 24, Queen h5 check wins');
  });

  test('translates a bare SAN mention with no move number', () => {
    expect(translateChessNotationForSpeech('what about Qh5+ here?')).toBe('what about Queen h5 check here?');
  });

  test('does not re-translate a destination square already emitted by a numbered-move translation', () => {
    // "h5" here is a leftover destination square inside the already-translated
    // "move 24, Queen h5 check" — must stay exactly that, not get treated as a
    // second bare SAN mention.
    expect(translateChessNotationForSpeech('24. Qh5+')).toBe('move 24, Queen h5 check');
  });

  test('translates multiple move mentions in the same message', () => {
    expect(translateChessNotationForSpeech('24. a4 Nf6 25. Qh5+ was crushing')).toBe(
      'move 24, a4 Knight f6 move 25, Queen h5 check was crushing'
    );
  });

  test('leaves ordinary prose with no move mentions untouched', () => {
    expect(translateChessNotationForSpeech('what did you consider here?')).toBe('what did you consider here?');
  });
});
