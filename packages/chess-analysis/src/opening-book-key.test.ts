import { describe, expect, test } from 'vitest';
import { Chess } from 'chess.js';
import { positionKey } from './opening-book-key.js';

describe('positionKey', () => {
  test('drops an unavailable en-passant square from the opening vector', () => {
    const chess = new Chess();
    for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'd4']) chess.move(san);
    const fenWithUnavailableEp = chess.fen().replace(' - 0 3', ' d3 0 3');

    expect(positionKey(fenWithUnavailableEp)).toBe(
      'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq -',
    );
  });

  test('keeps an en-passant square when the capture is legal', () => {
    const fen = 'rnbqkbnr/ppp1ppp1/8/3pP2p/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';

    expect(
      new Chess(fen).moves({ verbose: true }).some((move) => move.flags.includes('e')),
    ).toBe(true);
    expect(positionKey(fen)).toBe(
      'rnbqkbnr/ppp1ppp1/8/3pP2p/8/8/PPPP1PPP/RNBQKBNR w KQkq d6',
    );
  });
});
