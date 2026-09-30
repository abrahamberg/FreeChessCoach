import type { DiagnosisCodeId } from '@freechesscoach/shared';
import { motifToCode } from '../diagnostics/motif-to-code.js';
import type { CourseDossier } from './dossier.js';
import type { CourseTree } from './tree.js';

/**
 * The diagnosis codes a course trains: each learner move that plays a
 * detected motif, through `motifToCode`, in the order they first appear.
 *
 * An endgame course adds nothing of its own: the skeleton's goal is "win" or
 * "draw", and no EG code names either (they name techniques: Lucena,
 * opposition), so the creator adds one from the catalogue when it fits.
 */
export function courseDiagnosisCodes(tree: CourseTree, dossier: CourseDossier): DiagnosisCodeId[] {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const codes: DiagnosisCodeId[] = [];
  for (const facts of dossier.nodes) {
    const node = byId.get(facts.nodeId);
    if (!node || facts.side !== dossier.learnerSide || !facts.motif) continue;
    const fenBefore = (node.parentId ? byId.get(node.parentId)?.fenAfter : tree.startFen) ?? tree.startFen;
    const code = motifToCode(facts.motif, { fenBefore, moveSan: node.san });
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes;
}
