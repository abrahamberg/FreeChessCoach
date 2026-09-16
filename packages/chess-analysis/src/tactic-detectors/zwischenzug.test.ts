import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { zwischenzugDetector } from './zwischenzug.js';

/** Black has just taken on d4. Instead of recapturing, White checks. */
const THEY_JUST_CAPTURED = '4k3/8/8/8/3p4/8/8/3QK2R w K - 0 1';
const THEIR_CAPTURE = { from: 'e5', to: 'd4', wasCapture: true } as const;

describe('zwischenzugDetector', () => {
  test('claims a check thrown in ahead of the recapture', () => {
    const [claim] = zwischenzugDetector.detect(buildTacticDetectionContext(THEY_JUST_CAPTURED, 'Qa4+', 'white', THEIR_CAPTURE));

    expect(claim).toMatchObject({ type: 'zwischenzug', actor: 'a4', targets: ['d4'], gainKind: 'tempo' });
  });

  test('says nothing about the recapture itself', () => {
    expect(zwischenzugDetector.detect(buildTacticDetectionContext(THEY_JUST_CAPTURED, 'Qxd4', 'white', THEIR_CAPTURE))).toEqual([]);
  });

  test('stays silent when the move list is unknown', () => {
    // The motif is defined by move order, so with no history there is
    // nothing to claim — guessing is how the phantoms got in.
    expect(zwischenzugDetector.detect(buildTacticDetectionContext(THEY_JUST_CAPTURED, 'Qa4+', 'white'))).toEqual([]);
  });
});
