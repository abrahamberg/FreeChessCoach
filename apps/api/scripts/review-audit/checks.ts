import { checkDossierFact } from './check-dossier.js';
import { checkReviewItem } from './check-review.js';
import { mateWithoutCount, mentionOn, mentions } from './oracle.js';
import { DESCRIPTIVE_SOURCES } from './sources.js';
import type { AuditItem, AuditPosition, CheckResult } from './types.js';

/** Runs every check that applies to an item and says whether they settle it. */
export function checkItem(item: AuditItem, position: AuditPosition): { checks: CheckResult[]; settled: boolean } {
  const checks = [namedPieces(item), ...mateCount(item, position), ...(item.surface === 'review' ? checkReviewItem(item, position) : checkDossierFact(item, position))];
  const passed = checks.every((check) => check.ok);
  return { checks, settled: passed && isDescriptive(item) };
}

function isDescriptive(item: AuditItem): boolean {
  if (DESCRIPTIVE_SOURCES.has(item.source)) return true;
  // A plain "attacks the bishop on f4", with no pin or trap to judge.
  const data = item.data as { pinnedTo?: unknown; trapped?: unknown } | null;
  return item.source === 'dossier:board:attacks' && !data?.pinnedTo && !data?.trapped;
}

/** A card that says a mate is forced says in how many moves (the owner's
 * calibration, 2026-10-01). The dossier's `tactics` rows are the same cards. */
function mateCount(item: AuditItem, position: AuditPosition): CheckResult[] {
  if (!item.source.startsWith('review:tactic-') && item.source !== 'dossier:tactics') return [];
  if (!/\bmate\b/.test(item.text)) return [];
  return [{ check: 'mate-count', ok: !mateWithoutCount(item.text, position.san), detail: mateWithoutCount(item.text, position.san) ? 'a forced mate with no number of moves' : '' }];
}

/** Every "the rook on d1" a sentence names must stand there on a board the
 * reader can see: before the move, after it, or along a move or line the
 * sentence itself names. A piece that is only there deep in a line nobody
 * showed is the owner's first report (25.Qxc7, "unveils the rook on d1"). */
function namedPieces(item: AuditItem): CheckResult {
  const missing = mentions(item.text).filter((mention) => !item.contextFens.some((fen) => mentionOn(fen, mention)));
  return {
    check: 'named-pieces',
    ok: missing.length === 0,
    detail: missing.length ? `not on the board shown: ${missing.map((mention) => mention.text).join(', ')}` : ''
  };
}
