import { bv01OwnHangingPieceBlindness } from './detectors/bv-01-own-hanging-piece-blindness.js';
import { bv02OpponentHangingPieceBlindness } from './detectors/bv-02-opponent-hanging-piece-blindness.js';
import { bv04AttackerDefenderCountingFailure } from './detectors/bv-04-attacker-defender-counting.js';
import { bv10LastMoveBoardUpdateFailure } from './detectors/bv-10-last-move-board-update.js';
import { bv12RemovedBlockerBlindness } from './detectors/bv-12-removed-blocker-blindness.js';
import { bv15DestinationSquareSafetyBlindness } from './detectors/bv-15-destination-square-safety.js';
import { bv16SelfExposureBlindness } from './detectors/bv-16-self-exposure-blindness.js';
import { bv22LoosePieceInventoryFailure } from './detectors/bv-22-loose-piece-inventory.js';
import { ms01OpponentCheckScanOmission } from './detectors/ms-01-opponent-check-scan.js';
import { ms02OpponentCaptureScanOmission } from './detectors/ms-02-opponent-capture-scan.js';
import { ms03OpponentThreatScanOmission } from './detectors/ms-03-opponent-threat-scan.js';
import { ms04OwnCheckGenerationOmission } from './detectors/ms-04-own-check-generation.js';
import { ms05OwnCaptureGenerationOmission } from './detectors/ms-05-own-capture-generation.js';
import { ms06OwnThreatGenerationOmission } from './detectors/ms-06-own-threat-generation.js';
import { ms07AutomaticRecaptureReflex } from './detectors/ms-07-automatic-recapture-reflex.js';
import { ms08DestinationSafetyOmission } from './detectors/ms-08-destination-safety.js';
import { ms14LoosePieceScanOmission } from './detectors/ms-14-loose-piece-scan.js';
import { TA_DEFENSIVE_DETECTORS } from './detectors/ta-defensive.js';
import { TA_OFFENSIVE_DETECTORS } from './detectors/ta-offensive.js';
import type { DiagnosticDetector } from './types.js';

/**
 * Priority-ordered per §I.3 causal precedence: Task 54.3's precedence pass
 * resolves ties by walking this order, so order here IS the tie-break, same
 * shape as `tactic-detectors/registry.ts`. Unlike that registry, a ply is
 * not required to stop at the first match — several independent detectors
 * may each report their own opportunity for the same ply (Task 53.1's
 * checklist); this array only fixes their relative precedence for when two
 * observations turn out to describe the same underlying incident.
 *
 * `BV-*` (board vision/model) sits ahead of `MS-*` (scan/process) in this
 * list because §I.3's chain puts "board model" upstream of "scan/process" —
 * a board-vision failure is tested before the move-safety-process omission
 * it can produce (e.g. `BV-15`/`MS-08` name the same fact at each layer).
 * Priorities are left in decade blocks per family (`BV-*` 10-80, `MS-*`
 * 110-190, `TA-*` offensive 210-350, `TA-*` defensive 410-490) so a later
 * family can be inserted between two existing ones without renumbering
 * everything. `TA-*` (recognition) sits after `MS-*` (scan/process) for the
 * same §I.3 reason `MS-*` sits after `BV-*` (board model).
 */
const detectors: DiagnosticDetector[] = [
  bv01OwnHangingPieceBlindness,
  bv02OpponentHangingPieceBlindness,
  bv04AttackerDefenderCountingFailure,
  bv10LastMoveBoardUpdateFailure,
  bv12RemovedBlockerBlindness,
  bv15DestinationSquareSafetyBlindness,
  bv16SelfExposureBlindness,
  bv22LoosePieceInventoryFailure,
  ms01OpponentCheckScanOmission,
  ms02OpponentCaptureScanOmission,
  ms03OpponentThreatScanOmission,
  ms04OwnCheckGenerationOmission,
  ms05OwnCaptureGenerationOmission,
  ms06OwnThreatGenerationOmission,
  ms07AutomaticRecaptureReflex,
  ms08DestinationSafetyOmission,
  ms14LoosePieceScanOmission,
  ...TA_OFFENSIVE_DETECTORS,
  ...TA_DEFENSIVE_DETECTORS
];
export const DIAGNOSTIC_DETECTORS: DiagnosticDetector[] = detectors.sort(
  (a, b) => a.priority - b.priority
);
