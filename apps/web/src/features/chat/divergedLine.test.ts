import { describe, expect, it } from 'vitest';
import { decodeDivergedLine, encodeDivergedLine, type DivergedLineState } from './divergedLine.js';

const line: DivergedLineState = {
  basePly: 15,
  baseFen: 'base-fen',
  moves: [{ nodeId: 'x1', san: 'Bxa5', fen: 'after-fen', uci: 'b6a5' }]
};

describe('the diverged-line message', () => {
  it('carries the engine dossier as an alternative path, and the transcript shows only the words', () => {
    const text = encodeDivergedLine(line, 'what about this?', 'Bxa5 (blunder):\nPlayed Bxa5 instead of the engine\'s best, Nxa5.');

    expect(text).toContain('[line_review]');
    expect(text).toContain('ALTERNATIVE PATH');
    expect(text).toContain('Played Bxa5 instead');
    expect(decodeDivergedLine(text)?.content).toBe('what about this?');
  });

  it('has no review block without a dossier', () => {
    expect(encodeDivergedLine(line, 'hi')).not.toContain('[line_review]');
  });
});
