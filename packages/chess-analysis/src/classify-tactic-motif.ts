import type { MoveQuality, TacticMotifType } from '@freechesscoach/shared';
import { headlineTacticClaim, rankTacticClaims } from './rank-tactic-claims.js';
import { buildTacticDetectionContext, type PreviousMove } from './tactic-detectors/context.js';
import { proposeTacticClaims } from './tactic-detectors/registry.js';
import { verifyTacticClaims, type VerifiedTacticClaim } from './verify-tactic-claims.js';

export type { TacticMotifType } from '@freechesscoach/shared';

export interface TacticMotifContext {
  fenBefore: string;
  moveSan: string;
  mover: 'white' | 'black';
  /** This move's own already-computed classification — for a played move,
   * the result of `classifyMove`; for the engine's best move (evaluated as
   * if it had been played, to find the "opportunity"), the caller's own
   * hypothetical classification. */
  quality: MoveQuality;
  isCheckmate: boolean;
  /** §7.2's existing "is this a tactical position" signal.
   *
   * No longer gates a catch-all: the shipped classifier answered `'other'`
   * for a sharp position it couldn't name, which is a card that says "a
   * tactic happened, we don't know which" — exactly the sentence
   * `docs/tactics-rework.md` §3's acceptance bar rules out ("no sentence
   * ships that can't say what the tactic gets you"). With the phase-D
   * vocabulary a move that still matches nothing genuinely has nothing to
   * say. Kept on the input because callers pass it and because it stays part
   * of the move's own report data. */
  isTacticalPosition: boolean;
  /** The opponent's previous move, when the caller knows it. Only a
   * recapture gate reads it, but that gate is the single biggest source of
   * false tactics: see `verify-tactic-claims.ts`. */
  previous?: PreviousMove | null;
}

/**
 * Every claim this move survives with, plus the one that leads the card.
 *
 * Multi-label by design (`docs/tactics-rework.md` §5 layer 3): a move that
 * is genuinely a fork *and* a discovered attack keeps both, so the coach
 * agent can reason over the full set while the review shows the one that won
 * the material.
 */
export interface TacticClassification {
  /** The motif the card leads with, `null` when the move has nothing to
   * say. `checkmate`/`brilliantSacrifice` come from the move's own quality
   * rather than from a claim. */
  headline: TacticMotifType | null;
  /** Verified claims, best first. Kept even when `headline` is one of the
   * quality-derived motifs — TR-08 in `tactic-review-cases.ts` is the case
   * where answering "brilliant sacrifice" used to discard the discovered
   * attack that made it brilliant. */
  claims: VerifiedTacticClaim[];
}

/**
 * Runs the four layers over one move: propose (every detector), verify
 * (`verify-tactic-claims.ts`), rank (`rank-tactic-claims.ts`), and pick a
 * headline. Narration is layer 4's job and lives in `tactic-reason-text.ts`.
 *
 * To add a new tactic, add a detector — see `tactic-detectors/README.md` —
 * rather than editing this function.
 */
export function classifyTacticClaims(context: TacticMotifContext): TacticClassification {
  const detectionContext = buildTacticDetectionContext(
    context.fenBefore,
    context.moveSan,
    context.mover,
    context.previous ?? null
  );
  const claims = rankTacticClaims(
    verifyTacticClaims(detectionContext, proposeTacticClaims(detectionContext)),
    detectionContext.destination
  );

  return { headline: headlineFor(context, claims), claims };
}

function headlineFor(context: TacticMotifContext, claims: readonly VerifiedTacticClaim[]): TacticMotifType | null {
  if (context.isCheckmate) return 'checkmate';
  if (context.quality === 'brilliant') return 'brilliantSacrifice';

  return headlineTacticClaim(claims)?.type ?? null;
}

/**
 * The single motif a move's card leads with. Kept as its own function
 * because most callers only need the headline; anything that wants the
 * mechanism behind a `brilliantSacrifice`, or the second motif a move also
 * embodies, calls `classifyTacticClaims` instead.
 */
export function classifyTacticMotif(context: TacticMotifContext): TacticMotifType | null {
  return classifyTacticClaims(context).headline;
}
