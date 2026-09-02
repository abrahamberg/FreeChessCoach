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
 * Empty until Task 53.3 adds the first `MS-*` detectors — see `README.md`
 * for the "add a detector" flow.
 */
const detectors: DiagnosticDetector[] = [];
export const DIAGNOSTIC_DETECTORS: DiagnosticDetector[] = detectors.sort(
  (a, b) => a.priority - b.priority
);
