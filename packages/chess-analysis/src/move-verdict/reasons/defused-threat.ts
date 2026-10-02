import { TACTIC_MOTIF_TYPES } from '@freechesscoach/shared';
import type { PvMotifSighting } from '../../available-motifs-scan.js';
import { CONFIG } from '../../config.js';
import type { StandingThreat } from '../../standing-threat.js';
import type { VerifiedTacticClaim } from '../../verify-tactic-claims.js';
import type { VerdictContext } from '../context.js';
import { gapOf, narrowTo, type EvalPair } from '../eval-pair.js';
import { EMPTY_LINE_VALUE, netPawns, type LineValue } from '../line-value.js';
import type { ReasonCheck } from './confirmed.js';

const { minStaticGainPawns: MIN_GAIN_PAWNS, equalPrizeTolerancePawns: PRIZE_TOLERANCE_PAWNS } = CONFIG.tacticVerification;

/**
 * The move answered a threat the opponent had: worth the smaller of what the
 * threat would have won and gap(B, S). The only check that needs the
 * prevention scans, so it is the only one that asks for them.
 *
 * The scans see the opponent's threats from other boards (the position
 * before their previous move, and down its engine lines), and their claims
 * are checked on the board only. A card is written only for a threat that
 * - stands on the board before this move, as the opponent's next move
 *   (`standingThreat`), and
 * - is real: the engine's own line after the threat move wins what the card
 *   will say (`lineWinsIt`).
 * Anything else is no card: `docs/plan.md` finding F1 is three sentences
 * about pieces that were only on the scan's board.
 */
export const checkDefusedThreat: ReasonCheck = (ctx) => {
  const { best, second, mover } = ctx.frame;
  if (second === null) return null;
  const scans = ctx.input.preventionScans?.();
  if (!scans) return null;

  const outcome = ctx.deps.combineThreatOutcome(scans.before, scans.after);
  const threat = strongestThreat(realThreats(ctx, outcome.defusedSightings.filter((entry) => outcome.defused.includes(entry.motif))));
  if (!threat) return null;

  const { claim } = threat;
  const pair = narrowTo({ higherCpWhite: best, lowerCpWhite: second } satisfies EvalPair, threatCapCp(claim), mover);
  if (!gapOf(pair, mover).meaningful) return null;

  const tacticPrevention = {
    type: claim.type,
    prevented: true,
    threatSan: threat.moveSan,
    detail: claim.detail,
    visual: claim.evidence,
    gain: { kind: claim.gainKind, pawns: claim.verifiedGain, prize: claim.prize }
  };
  return {
    reason: 'defusedThreat',
    explained: pair,
    line: threatValue(claim),
    card: { tacticPrevention },
    threat: { fenBefore: threat.fenBefore, moveSan: threat.moveSan }
  };
};

/** The defused sightings that were threats on the reader's board, each as
 * it stands there. */
function realThreats(ctx: VerdictContext, sightings: readonly PvMotifSighting[]): StandingThreat[] {
  return sightings.flatMap((sighting) => {
    const threat = ctx.deps.standingThreat(sighting, ctx.frame.fenBefore);
    return threat && lineWinsIt(ctx, sighting, threat.claim) ? [threat] : [];
  });
}

/**
 * The engine's line after the threat move delivers the card's promise: mate
 * for a mate, and for material at least the claimed gain (within the slack
 * two prices of one piece get), counted over the whole line so a piece that
 * is taken back wins nothing. 12.Bxc5 "stopped a back-rank mate" whose line
 * went …Rxd1+ Rxd1.
 */
function lineWinsIt(ctx: VerdictContext, sighting: PvMotifSighting, claim: VerifiedTacticClaim): boolean {
  const threatener = ctx.frame.mover === 'white' ? 'black' : 'white';
  const line = ctx.deps.walkLineValue(sighting.fenBefore, sighting.lineSan, threatener, { mateIn: sighting.lineMateIn });
  if (line.mateFor) return true;
  if (claim.gainKind === 'mate') return false;
  return netPawns(line) >= Math.max(MIN_GAIN_PAWNS, claim.verifiedGain - PRIZE_TOLERANCE_PAWNS);
}

/** Mate first, then the biggest verified gain, then registry precedence. */
function strongestThreat(threats: readonly StandingThreat[]): StandingThreat | null {
  return [...threats].sort((a, b) => worthOf(b.claim) - worthOf(a.claim) || precedence(a.claim) - precedence(b.claim))[0] ?? null;
}

function worthOf(claim: VerifiedTacticClaim): number {
  return claim.gainKind === 'mate' ? Infinity : claim.verifiedGain;
}

function precedence(claim: VerifiedTacticClaim): number {
  return TACTIC_MOTIF_TYPES.indexOf(claim.type);
}

function threatCapCp(claim: VerifiedTacticClaim): number {
  return claim.gainKind === 'mate' ? Infinity : claim.verifiedGain * 100;
}

/** The threat as the mover's saving: what it would have taken. */
function threatValue(claim: VerifiedTacticClaim): LineValue {
  if (claim.gainKind === 'mate') return { ...EMPTY_LINE_VALUE, mateFor: true };
  return { ...EMPTY_LINE_VALUE, gainedPawns: claim.verifiedGain };
}
