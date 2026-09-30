import { describe, expect, test } from 'vitest';
import { currentMoveFacts } from './current-move.js';
import { renderBoardFact } from './render.js';

// White's rook on d1 guards e1; Rd2 leaves it, and …Re1# follows.
const BACK_RANK = '4r1k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';

describe('currentMoveFacts', () => {
  test('a blunder says what it gave up and what the better move was', () => {
    const facts = currentMoveFacts({ fenBefore: BACK_RANK, playedSan: 'Rd2', best: { san: 'h3', line: ['h3', 'h6'] }, continuation: ['Re1#'] });

    expect(facts.gaveUp.map(renderBoardFact)).toEqual(['the rook stops guarding e1, where Re1# follows']);
    expect(facts.better).toMatchObject({ san: 'h3', material: 'material is level' });
    expect(facts.playedLine).toBe('nothing is taken');
  });

  test('the best move has no "better" and gave nothing up', () => {
    const facts = currentMoveFacts({ fenBefore: BACK_RANK, playedSan: 'h3', best: { san: 'h3', line: ['h3', 'h6'] }, continuation: ['h6'] });

    expect(facts.better).toBeUndefined();
    expect(facts.gaveUp).toEqual([]);
  });

  test('a piece that can be won after the move is listed loose; a trade is not', () => {
    const hung = currentMoveFacts({ fenBefore: '4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1', playedSan: 'Qxd5', continuation: ['exd5'] });
    expect(hung.looseAfter).toContainEqual({ square: 'd5', piece: 'q', owner: 'w', tier: 'free' });

    const trade = currentMoveFacts({ fenBefore: '4k3/5p2/4p3/3p4/2P5/8/8/4K3 w - - 0 1', playedSan: 'cxd5', continuation: ['exd5'] });
    expect(trade.looseAfter).toEqual([]);
  });
});
