import type { DiagnosisCodeId } from '@freechesscoach/shared';
import type { PlyDiagnosticContext } from '../context.js';
import { motifToCode } from '../motif-to-code.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';

/**
 * §II.E `TA-*`, offensive direction: "using or creating the idea" — did the
 * mover play the engine's best move at this position when that move
 * embodied a named motif (`ctx.tacticOpportunity`, `docs/plan.md` Task
 * 53.5). One factory-built detector per resolved code rather than one file
 * each — `DiagnosticDetector.code` is fixed per detector, and a shared
 * `detect` differs only in which code `motifToCode` must resolve to, so a
 * declarative table is the actual shape of this problem (15 near-identical
 * detectors), not premature abstraction over it.
 *
 * `checkmate`/`weakBackRank`/`skewer`/`discoveredAttack`/`doubleCheck`/
 * `removesDefender`/`overloadedDefender`/`trappedPiece`/`freePiece` map to
 * one code each; `fork`/`pin` split by piece/kind (`motif-to-code.ts`) into
 * `TA-07..10`/`TA-11..12`.
 */
const OFFENSIVE_CODES: readonly DiagnosisCodeId[] = [
  'TA-01',
  'TA-04',
  'TA-07',
  'TA-08',
  'TA-09',
  'TA-10',
  'TA-11',
  'TA-12',
  'TA-14',
  'TA-16',
  'TA-17',
  'TA-18',
  'TA-19',
  'TA-26',
  'TA-43'
];

function buildOffensiveDetector(code: DiagnosisCodeId, priority: number): DiagnosticDetector {
  return {
    code,
    direction: 'O',
    priority,
    detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
      const opportunity = ctx.tacticOpportunity;
      if (!opportunity) return null;

      // The move the motif was actually read off — the player's own when
      // they matched the engine's chance by an equally good move, so a fork
      // resolves to the piece that really forked. Older stored reports carry
      // no such field and can only mean the engine's top move.
      const embodying = opportunity.embodiedBySan ?? ctx.bestMoveSan;
      const replay = embodying ? { fenBefore: ctx.fenBefore, moveSan: embodying } : undefined;
      if (motifToCode(opportunity.type, replay) !== code) return null;

      const failed = !opportunity.found;
      const rankHit = (ctx.tacticRankHits ?? []).find(
        (hit) => hit.motif === opportunity.type && hit.playedRank !== null
      );

      return {
        code,
        direction: 'O',
        ply: ctx.ply,
        failed,
        hwdl: failed ? (ctx.drop ?? 0) / 100 : 0,
        severity: failed ? 'meaningful' : 'minor',
        reachability: 1,
        detail: opportunity.detail ?? `${opportunity.type} opportunity at this position`,
        rank: rankHit?.rank
      };
    }
  };
}

/** Priority block 210-350 (decade gaps): recognition/candidate-generation
 * sits downstream of `MS-*`'s scan/process (110-190) and `BV-*`'s board
 * model (10-80) in §I.3's causal chain. */
export const TA_OFFENSIVE_DETECTORS: readonly DiagnosticDetector[] = OFFENSIVE_CODES.map((code, index) =>
  buildOffensiveDetector(code, 210 + index * 10)
);
