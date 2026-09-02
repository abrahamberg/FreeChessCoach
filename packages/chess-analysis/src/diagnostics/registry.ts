import { ms01OpponentCheckScanOmission } from './detectors/ms-01-opponent-check-scan.js';
import { ms02OpponentCaptureScanOmission } from './detectors/ms-02-opponent-capture-scan.js';
import { ms03OpponentThreatScanOmission } from './detectors/ms-03-opponent-threat-scan.js';
import { ms04OwnCheckGenerationOmission } from './detectors/ms-04-own-check-generation.js';
import { ms05OwnCaptureGenerationOmission } from './detectors/ms-05-own-capture-generation.js';
import { ms06OwnThreatGenerationOmission } from './detectors/ms-06-own-threat-generation.js';
import { ms07AutomaticRecaptureReflex } from './detectors/ms-07-automatic-recapture-reflex.js';
import { ms08DestinationSafetyOmission } from './detectors/ms-08-destination-safety.js';
import { ms14LoosePieceScanOmission } from './detectors/ms-14-loose-piece-scan.js';
import type { DiagnosticDetector } from './types.js';

/**
 * Priority-ordered per §I.3 causal precedence: Task 54.3's precedence pass
 * resolves ties by walking this order, so order here IS the tie-break, same
 * shape as `tactic-detectors/registry.ts`. Unlike that registry, a ply is
 * not required to stop at the first match — several independent detectors
 * may each report their own opportunity for the same ply (Task 53.1's
 * checklist); this array only fixes their relative precedence for when two
 * observations turn out to describe the same underlying incident.
 */
const detectors: DiagnosticDetector[] = [
  ms01OpponentCheckScanOmission,
  ms02OpponentCaptureScanOmission,
  ms03OpponentThreatScanOmission,
  ms04OwnCheckGenerationOmission,
  ms05OwnCaptureGenerationOmission,
  ms06OwnThreatGenerationOmission,
  ms07AutomaticRecaptureReflex,
  ms08DestinationSafetyOmission,
  ms14LoosePieceScanOmission
];
export const DIAGNOSTIC_DETECTORS: DiagnosticDetector[] = detectors.sort(
  (a, b) => a.priority - b.priority
);
