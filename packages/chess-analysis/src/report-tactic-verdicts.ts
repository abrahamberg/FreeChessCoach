import type { ClassifiedMoveDto, EngineEval } from '@freechesscoach/shared';
import { decideMoveVerdict, DEFAULT_VERDICT_DEPS, type MoveVerdict, type MoveVerdictDeps, type PreventionScans } from './move-verdict/index.js';
import { previousMoveOf } from './previous-move-of.js';
import { orderTacticCards, type TacticCardKind } from './tactic-card-order.js';
import { tacticAllowedReason, tacticOpportunityReason, tacticPreventionReason } from './tactic-reason-text.js';

export interface TacticVerdictOptions {
  /** The opponent's realistic threats before and after `move`
   * (apps/api's `tactic-prevention.ts`), asked for only when
   * `defusedThreat` is actually checked. Omitted: no move is ever credited
   * with a defused threat, and the report's prevention counts stay unset. */
  preventionScans?: (move: ClassifiedMoveDto) => PreventionScans | null;
  /** The benchmark's counting deps; the shipped functions otherwise. */
  verdictDeps?: MoveVerdictDeps;
}

export interface TacticVerdictResult {
  moves: ClassifiedMoveDto[];
  /** Every move's verdict by ply, `null` included — what the report's
   * counts and the diagnostics are read off. */
  verdicts: Map<number, MoveVerdict | null>;
}

/**
 * One tactic reason per move (`docs/plan.md` Task 77.5): each move's verdict
 * sets **at most one** of `tacticOpportunity` / `tacticAllowed` /
 * `tacticPrevention`, and its sentence (plus the verdict's detail, e.g. "won
 * a knight, but it cost the queen") is written into `reasons`.
 *
 * `moves` must already carry `isTacticalPosition` (the detectors read it),
 * both for the move itself and for its reply, which the `allowed*` check
 * reads its card off.
 */
export function attachTacticVerdicts(moves: readonly ClassifiedMoveDto[], evals: EngineEval[], options: TacticVerdictOptions = {}): TacticVerdictResult {
  const verdicts = new Map<number, MoveVerdict | null>();
  const deps = options.verdictDeps ?? DEFAULT_VERDICT_DEPS;
  const scansFor = options.preventionScans;

  const withCards = moves.map((move, index) => {
    const verdict = decideMoveVerdict(
      {
        move,
        evals,
        previous: previousMoveOf(moves, move.ply),
        next: moves[index + 1],
        ...(scansFor ? { preventionScans: () => scansFor(move) } : {})
      },
      deps
    );
    verdicts.set(move.ply, verdict);
    return withVerdictCard(move, verdict);
  });
  return { moves: withCards, verdicts };
}

/**
 * Replaces whatever tactic cards the move came in with (an older caller
 * attached a prevention card before the report) by the verdict's one card.
 * Stale tactic sentences are dropped from `reasons` so the order can't be
 * decided by which layer ran first.
 */
function withVerdictCard(move: ClassifiedMoveDto, verdict: MoveVerdict | null): ClassifiedMoveDto {
  const { tacticOpportunity: _o, tacticAllowed: _a, tacticPrevention: _p, ...bare } = move;
  const stale = new Set(tacticSentencesOf(move).values());
  const base = move.reasons?.filter((reason) => !stale.has(reason));
  if (!verdict) return stale.size === 0 ? bare : { ...bare, reasons: base ?? [] };

  const { detail, ...card } = verdict.card;
  const carded: ClassifiedMoveDto = { ...bare, ...card };
  const sentences = tacticSentencesOf(carded);
  const ordered = orderTacticCards()
    .map((kind) => sentences.get(kind))
    .filter((sentence): sentence is string => sentence !== undefined);
  const detailLine = detail ? [`${detail.charAt(0).toUpperCase()}${detail.slice(1)}.`] : [];
  return { ...carded, reasons: [...(base ?? []), ...ordered, ...detailLine] };
}

/**
 * Each card's sentence, written to the person whose review this is —
 * `isUserMove` is passed rather than stored on the card so an older report
 * renders in the right voice too.
 */
export function tacticSentencesOf(move: ClassifiedMoveDto): Map<TacticCardKind, string> {
  const sentences = new Map<TacticCardKind, string>();
  if (move.tacticAllowed) {
    sentences.set('allowed', tacticAllowedReason({ ...move.tacticAllowed, isUserMove: move.isUserMove }));
  }
  if (move.tacticPrevention) {
    sentences.set('prevention', tacticPreventionReason({ ...move.tacticPrevention, isUserMove: move.isUserMove }));
  }
  if (move.tacticOpportunity) {
    sentences.set('opportunity', tacticOpportunityReason({ ...move.tacticOpportunity, isUserMove: move.isUserMove }, move.bestMoveSan));
  }
  return sentences;
}
