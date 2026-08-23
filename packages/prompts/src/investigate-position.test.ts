import { describe, expect, test } from 'vitest';
import { INVESTIGATE_POSITION_SYSTEM_PROMPT, renderInvestigatePositionPrompt } from './investigate-position.js';

describe('renderInvestigatePositionPrompt', () => {
  test('includes the starting fen and the question verbatim', () => {
    const text = renderInvestigatePositionPrompt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'Is Nf3 sound here?');

    expect(text).toContain('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(text).toContain('Is Nf3 sound here?');
  });
});

describe('INVESTIGATE_POSITION_SYSTEM_PROMPT', () => {
  test('instructs a concrete, engine-grounded answer under 120 words and forbids fabricated FENs/lines', () => {
    expect(INVESTIGATE_POSITION_SYSTEM_PROMPT).toContain('under 120 words');
    expect(INVESTIGATE_POSITION_SYSTEM_PROMPT).toContain('Never fabricate a FEN or a line');
  });
});
