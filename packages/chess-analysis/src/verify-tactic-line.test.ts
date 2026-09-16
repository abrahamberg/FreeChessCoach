import { describe, expect, test } from 'vitest';
import { classifyTacticClaims } from './classify-tactic-motif.js';
import { buildTacticDetectionContext } from './tactic-detectors/context.js';
import { proposeTacticClaims } from './tactic-detectors/registry.js';
import { verifyTacticClaims } from './verify-tactic-claims.js';
import { verifyTacticClaimsAgainstLine } from './verify-tactic-line.js';

/** White's knight on c4 hops to d6, forking the king on e8 and the rook on
 * b7. The engine's own line cashes it: the king steps aside and the knight
 * takes the rook. */
const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const FORK_IS_CASHED = ['Nd6+', 'Kd8', 'Nxb7+'];
/** The same fork, but the knight wanders off and never collects. */
const FORK_IS_ABANDONED = ['Nd6+', 'Kd8', 'Nf5', 'Ke8', 'Ne3'];

function verifiedWith(fen: string, moveSan: string, pvSan: string[]) {
  const context = buildTacticDetectionContext(fen, moveSan, 'white');
  const statically = verifyTacticClaims(context, proposeTacticClaims(context));
  return verifyTacticClaimsAgainstLine(context, statically, pvSan);
}

describe('verifyTacticClaimsAgainstLine', () => {
  test('keeps a material claim the line actually pays, and says when it paid', () => {
    const fork = verifiedWith(FORK_FEN, 'Nd6+', FORK_IS_CASHED).find((claim) => claim.type === 'fork');

    expect(fork).toMatchObject({ verifiedBy: 'line', horizon: 'inTwo' });
    expect(fork!.verifiedGain).toBeGreaterThanOrEqual(1.5);
    expect(fork!.confidence).toBeGreaterThanOrEqual(0.95);
  });

  test('drops a material claim the engine\'s own continuation never collects', () => {
    // The whole 22.4% -> 2.5% idea in one assertion: the shape is on the
    // board either way, and only one of the two lines makes it a tactic.
    expect(verifiedWith(FORK_FEN, 'Nd6+', FORK_IS_ABANDONED).map((claim) => claim.type)).not.toContain('fork');
  });

  test('leaves a claim that promises no material exactly as the static pass left it', () => {
    // A bind, a tempo or a piece saved is not something the line can pay or
    // refuse; dropping those for failing a test they were never taking is
    // how a verifier deletes the defensive vocabulary.
    const statics = verifiedWith(FORK_FEN, 'Nd6+', FORK_IS_ABANDONED);

    expect(statics.every((claim) => claim.gainKind !== 'material' && claim.gainKind !== 'mate')).toBe(true);
    expect(statics.every((claim) => claim.verifiedBy === 'static')).toBe(true);
  });

  test('a line too short to show anything leaves every claim standing', () => {
    const short = verifiedWith(FORK_FEN, 'Nd6+', ['Nd6+', 'Kd8']);

    expect(short.map((claim) => claim.type)).toContain('fork');
    expect(short.every((claim) => claim.verifiedBy === 'static')).toBe(true);
  });

  test('classifyTacticClaims runs the line pass when the caller has a PV', () => {
    const withLine = classifyTacticClaims({
      fenBefore: FORK_FEN,
      moveSan: 'Nd6+',
      mover: 'white',
      quality: 'best',
      isCheckmate: false,
      isTacticalPosition: true,
      pvSan: FORK_IS_ABANDONED
    });
    const withoutLine = classifyTacticClaims({
      fenBefore: FORK_FEN,
      moveSan: 'Nd6+',
      mover: 'white',
      quality: 'best',
      isCheckmate: false,
      isTacticalPosition: true
    });

    expect(withoutLine.claims.map((claim) => claim.type)).toContain('fork');
    expect(withLine.claims.map((claim) => claim.type)).not.toContain('fork');
  });
});
