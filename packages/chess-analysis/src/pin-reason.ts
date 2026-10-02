import { PIECE_NAMES } from './piece-names.js';
import { buildTacticDetectionContext } from './tactic-detectors/context.js';
import { pinDetector } from './tactic-detectors/pin.js';
import { verifyTacticClaims } from './verify-tactic-claims.js';

/**
 * The pin a move makes, said on the move itself: "Pins the knight on f6 to
 * the queen".
 *
 * A tactic card names a pin only when the eval swings on it
 * (`move-verdict/gate.ts`), and the pin a player sets up in the opening
 * rarely moves the eval at all: 4.Bg5 on a knight in front of its queen came
 * back with no note. The claim is the pin detector's own, through
 * `verifyTacticClaims`: new with this move, the pinner not lost on its
 * square, and not an exchange offered (`tactic-pins.ts`).
 *
 * Step one of Task 126.2: a knight pinned by a bishop to the king or the
 * queen, the pin everyone names. On the 220 dev games that is 75 notes, at
 * most two in a game. Other shapes wait for a judged sample.
 */
const PIN_REASON = /^Pins the knight on [a-h][1-8] to the (king|queen)$/;

/** A move's plain reasons beside its tactic card. The card for the pin this
 * move made says it with what it wins; the note would be the same pin twice. */
export function withoutCardedPin(reasons: readonly string[], found: { type: string; found: boolean } | undefined): string[] {
  const carded = found?.found === true && found.type === 'pin';
  return carded ? reasons.filter((reason) => !PIN_REASON.test(reason)) : [...reasons];
}

export function pinReason(fenBefore: string, moveSan: string, mover: 'white' | 'black'): string | null {
  const context = buildTacticDetectionContext(fenBefore, moveSan, mover);
  const after = context.after;
  if (!after) return null;

  for (const claim of verifyTacticClaims(context, pinDetector.detect(context))) {
    const [pinned, against] = claim.targets;
    const behind = against ? after.get(against)?.type : undefined;
    if (!pinned || after.get(pinned)?.type !== 'n' || after.get(claim.actor)?.type !== 'b') continue;
    if (behind !== 'k' && behind !== 'q') continue;
    return `Pins the knight on ${pinned} to the ${PIECE_NAMES[behind]}`;
  }
  return null;
}
