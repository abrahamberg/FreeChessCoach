import { TACTIC_MOTIF_TYPES } from '@freechesscoach/shared';
import type { PvMotifSighting } from '../../available-motifs-scan.js';
import { gapOf, narrowTo, type EvalPair } from '../eval-pair.js';
import { EMPTY_LINE_VALUE, type LineValue } from '../line-value.js';
import { materialAgrees, type ReasonCheck } from './confirmed.js';

/**
 * The move answered a realistic threat the opponent had: worth the smaller
 * of what the threat would have won and gap(B, S). The only check that
 * needs the prevention scans, so it is the only one that asks for them.
 *
 * "What the threat would have won" is the sighting's own claim, which the
 * scan already walked through the threat's line (`verify-tactic-line.ts`),
 * so it is not walked a second time here.
 */
export const checkDefusedThreat: ReasonCheck = (ctx) => {
  const { best, second, mover } = ctx.frame;
  if (second === null) return null;
  const scans = ctx.input.preventionScans?.();
  if (!scans) return null;

  const outcome = ctx.deps.combineThreatOutcome(scans.before, scans.after);
  const sighting = strongestSighting(outcome.defusedSightings.filter((entry) => outcome.defused.includes(entry.motif)));
  if (!sighting) return null;

  const { claim } = sighting;
  const line = threatValue(sighting);
  const pair = narrowTo({ higherCpWhite: best, lowerCpWhite: second } satisfies EvalPair, threatCapCp(sighting), mover);
  if (!gapOf(pair, mover).meaningful || !materialAgrees(line, 'gain', claim.gainKind)) return null;

  const tacticPrevention = {
    type: claim.type,
    prevented: true,
    detail: claim.detail,
    visual: claim.evidence,
    gain: { kind: claim.gainKind, pawns: claim.verifiedGain, prize: claim.prize }
  };
  const threat = { fenBefore: sighting.fenBefore, moveSan: sighting.moveSan };
  return { reason: 'defusedThreat', explained: pair, line, card: { tacticPrevention }, threat };
};

/** Mate first, then the biggest verified gain, then registry precedence. */
function strongestSighting(sightings: readonly PvMotifSighting[]): PvMotifSighting | null {
  return [...sightings].sort((a, b) => sightingWorth(b) - sightingWorth(a) || precedence(a) - precedence(b))[0] ?? null;
}

function sightingWorth({ claim }: PvMotifSighting): number {
  return claim.gainKind === 'mate' ? Infinity : claim.verifiedGain;
}

function precedence(sighting: PvMotifSighting): number {
  return TACTIC_MOTIF_TYPES.indexOf(sighting.motif);
}

function threatCapCp(sighting: PvMotifSighting): number {
  return sighting.claim.gainKind === 'mate' ? Infinity : sighting.claim.verifiedGain * 100;
}

/** The threat's line as the mover's saving: what it would have taken. */
function threatValue({ claim }: PvMotifSighting): LineValue {
  if (claim.gainKind === 'mate') return { ...EMPTY_LINE_VALUE, mateFor: true };
  return { ...EMPTY_LINE_VALUE, gainedPawns: claim.verifiedGain };
}
