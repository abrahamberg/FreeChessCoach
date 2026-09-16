import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { outpostDetector, seizesOpenFileDetector } from './positional-squares.js';

/** No pawn of either colour on the e-file. */
const OPEN_FILE = '4r3/4k3/8/8/8/8/PPP2PPP/R3K3 w Q - 0 1';
/** e5 is held by the d4 pawn and no black pawn on d or f can ever come at
 * it. */
const OUTPOST_AVAILABLE = '4k3/8/1p6/8/3P4/3N4/8/4K3 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('seizesOpenFileDetector', () => {
  test('claims a rook swinging onto a file with no pawns on it', () => {
    const [claim] = seizesOpenFileDetector.detect(buildTacticDetectionContext(OPEN_FILE, 'Rd1', 'white'));

    expect(claim).toMatchObject({ type: 'seizesOpenFile', actor: 'd1', gainKind: 'positional' });
  });

  test('does not flag a quiet pawn move', () => {
    expect(seizesOpenFileDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});

describe('outpostDetector', () => {
  test('claims a knight landing where no enemy pawn can chase it', () => {
    const [claim] = outpostDetector.detect(buildTacticDetectionContext(OUTPOST_AVAILABLE, 'Ne5', 'white'));

    expect(claim).toMatchObject({ type: 'outpost', actor: 'e5', gainKind: 'positional' });
  });

  test('does not flag a quiet pawn move', () => {
    expect(outpostDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
