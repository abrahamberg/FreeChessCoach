import { ENGINE_MULTI_PV, type EngineLine } from '@freechesscoach/shared';
import { scanAvailableMotifs, type AvailableMotifScan, type PvMotifSighting } from './available-motifs-scan.js';
import { CONFIG } from './config.js';
import { evalGap } from './eval-witness.js';
import { toCpWhite, type PlayerColor } from './win-probability.js';

const { minStaticGainPawns: MIN_STATIC_GAIN_PAWNS } = CONFIG.tacticVerification;

/**
 * The threats in `scan` the side to move at `fen` would actually carry out —
 * the eval witness on "prevented" (`docs/plan.md` Task 76.5).
 *
 * `scanAvailableMotifs` credits a motif found anywhere in any of the top
 * lines, including a rank-4 line that loses. A sighting survives here only
 * when both hold:
 * - its claim wins something: mate, or material worth at least
 *   `CONFIG.tacticVerification.minStaticGainPawns` — a tempo or a bind is not
 *   a threat anyone has to answer;
 * - its line is one the side to move would play: the gap from the first line
 *   to this one is not meaningful (`evalGap`).
 *
 * `lines` are the engine lines `scan` was built from, White-perspective as
 * stored; the side to move is read off `fen`. Pure; `motifs` is recomputed
 * from the surviving sightings.
 */
export function realisticThreatScan(scan: AvailableMotifScan, lines: readonly EngineLine[], fen: string): AvailableMotifScan {
  const sideToMove = sideToMoveOf(fen);
  const sightings = scan.sightings.filter(
    (sighting) => winsSomething(sighting) && isPlayableLine(lines, sighting.rank, sideToMove)
  );
  return { motifs: new Set(sightings.map((sighting) => sighting.motif)), sightings };
}

/**
 * `realisticThreatScan(scanAvailableMotifs(fen, lines), lines, fen)`, with the
 * same result, but a rank whose line fails the playable-line half of the
 * filter is never walked: every sighting it could produce would be dropped.
 * The claim-gain half still needs the scanned claims, so it runs after.
 */
export function scanRealisticThreats(fen: string, lines: readonly EngineLine[]): AvailableMotifScan {
  const sideToMove = sideToMoveOf(fen);
  const scan = scanAvailableMotifs(fen, lines, ENGINE_MULTI_PV, (rank) => isPlayableLine(lines, rank, sideToMove));
  return realisticThreatScan(scan, lines, fen);
}

function winsSomething({ claim }: PvMotifSighting): boolean {
  if (claim.gainKind === 'mate') return true;
  return claim.gainKind === 'material' && claim.verifiedGain >= MIN_STATIC_GAIN_PAWNS;
}

function isPlayableLine(lines: readonly EngineLine[], rank: number, sideToMove: PlayerColor): boolean {
  const best = lines[0];
  const line = lines[rank];
  if (!best || !line) return false;
  return !evalGap(toCpWhite(best), toCpWhite(line), sideToMove).meaningful;
}

function sideToMoveOf(fen: string): PlayerColor {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}
