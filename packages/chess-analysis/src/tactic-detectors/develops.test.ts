import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { developsDetector } from './develops.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

describe('developsDetector', () => {
  test('claims a minor piece leaving its starting rank', () => {
    const [claim] = developsDetector.detect(buildTacticDetectionContext(AFTER_E4_E5, 'Nf3', 'white'));

    expect(claim).toMatchObject({ type: 'develops', actor: 'f3', gainKind: 'positional' });
  });

  test('says nothing about a pawn move', () => {
    expect(developsDetector.detect(buildTacticDetectionContext(START, 'e4', 'white'))).toEqual([]);
  });
});
