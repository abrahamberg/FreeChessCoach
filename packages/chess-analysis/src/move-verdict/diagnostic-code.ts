import { Chess, type Move } from 'chess.js';
import type { ClassifiedMoveDto, DiagnosisCodeId, Direction, PositionFeatures, TacticMotifType } from '@freechesscoach/shared';
import { motifToCode, type MotifReplay } from '../diagnostics/motif-to-code.js';
import type { MoveVerdict } from './types.js';

/** The one diagnostic observation a verdict stands for. */
export interface VerdictDiagnosticCode {
  code: DiagnosisCodeId;
  direction: Direction;
}

/**
 * The verdict → diagnosis-code table of `docs/plan.md` Task 77.5, one code
 * per ply:
 *
 * | Verdict | Code |
 * |---|---|
 * | any, when the card's motif has a `TA-*` code | `motifToCode(type, embodying move)`: `O` for missed/found, `D` for allowed/defused |
 * | allowed: the reply wins a piece already hanging before the move | BV-01 D |
 * | allowed: the reply wins the moved piece | BV-15 B |
 * | allowed: another capture | MS-02 D |
 * | allowed: a check | MS-01 D |
 * | allowed: a quiet threat | MS-03 D |
 * | missed/found: a free capture of a hanging piece | BV-02 O |
 * | missed/found: another capture | MS-05 O |
 * | missed/found: a check | MS-04 O |
 * | missed/found: a quiet threat | MS-06 O |
 * | defusedThreat | the code the matching allowed would have used |
 *
 * `freePiece` is the one motif kept out of the `TA-*` row: a free capture
 * *is* the plan's "free capture" / "piece already hanging" row, so it maps
 * to BV-01/BV-02/MS-02/MS-05 by shape rather than to TA-43, which would name
 * the same event twice. Whether it succeeded is the caller's
 * (`verdict.kind`), not this table's.
 *
 * `featuresBefore` is the mover's position before the move — what "already
 * hanging" is read off. `null` when the card carries nothing to map.
 */
export function verdictDiagnosticCode(
  verdict: MoveVerdict,
  move: ClassifiedMoveDto,
  featuresBefore: Pick<PositionFeatures, 'hangingPieces'>
): VerdictDiagnosticCode | null {
  const { card } = verdict;
  if (card.tacticOpportunity) return ownChanceCode(card.tacticOpportunity, verdict, move, featuresBefore);
  if (card.tacticAllowed) {
    const { byMoveSan } = card.tacticAllowed;
    const replay = byMoveSan && move.fenAfter ? { fenBefore: move.fenAfter, moveSan: byMoveSan } : undefined;
    return threatCode(card.tacticAllowed.type, replay, move, featuresBefore);
  }
  if (card.tacticPrevention) return threatCode(card.tacticPrevention.type, verdict.threat, move, featuresBefore);
  return null;
}

type Opportunity = NonNullable<MoveVerdict['card']['tacticOpportunity']>;

function ownChanceCode(
  opportunity: Opportunity,
  verdict: MoveVerdict,
  move: ClassifiedMoveDto,
  featuresBefore: Pick<PositionFeatures, 'hangingPieces'>
): VerdictDiagnosticCode {
  const embodying = opportunity.embodiedBySan ?? (verdict.kind === 'failure' ? move.bestMoveSan : move.moveSan);
  const replay = embodying && move.fenBefore ? { fenBefore: move.fenBefore, moveSan: embodying } : undefined;
  const tactic = tacticCode(opportunity.type, replay);
  if (tactic) return { code: tactic, direction: 'O' };

  const played = replayed(replay);
  if (played?.captured) {
    const hanging = isHangingAt(featuresBefore, played.to, opponentOf(move.mover));
    return { code: hanging ? 'BV-02' : 'MS-05', direction: 'O' };
  }
  return { code: played && givesCheck(played) ? 'MS-04' : 'MS-06', direction: 'O' };
}

/** What the opponent's move (the reply an allowed card names, or the threat
 * a defused card names) wins, by shape. */
function threatCode(
  type: TacticMotifType,
  replay: MotifReplay | undefined,
  move: ClassifiedMoveDto,
  featuresBefore: Pick<PositionFeatures, 'hangingPieces'>
): VerdictDiagnosticCode {
  const tactic = tacticCode(type, replay);
  if (tactic) return { code: tactic, direction: 'D' };

  const reply = replayed(replay);
  if (reply?.captured) {
    if (reply.to === destinationOf(move)) return { code: 'BV-15', direction: 'B' };
    if (isHangingAt(featuresBefore, reply.to, move.mover)) return { code: 'BV-01', direction: 'D' };
    return { code: 'MS-02', direction: 'D' };
  }
  return { code: reply && givesCheck(reply) ? 'MS-01' : 'MS-03', direction: 'D' };
}

function tacticCode(type: TacticMotifType, replay: MotifReplay | undefined): DiagnosisCodeId | null {
  return type === 'freePiece' ? null : motifToCode(type, replay);
}

function replayed(replay: MotifReplay | undefined): Move | null {
  if (!replay) return null;
  try {
    return new Chess(replay.fenBefore).move(replay.moveSan);
  } catch {
    return null;
  }
}

function destinationOf(move: ClassifiedMoveDto): string | null {
  if (move.uci && move.uci.length >= 4) return move.uci.slice(2, 4);
  return replayed(move.fenBefore ? { fenBefore: move.fenBefore, moveSan: move.moveSan } : undefined)?.to ?? null;
}

function isHangingAt(features: Pick<PositionFeatures, 'hangingPieces'>, square: string, color: 'white' | 'black'): boolean {
  return features.hangingPieces.some((piece) => piece.square === square && piece.color === color);
}

function givesCheck(move: Move): boolean {
  return move.san.includes('+') || move.san.includes('#');
}

function opponentOf(mover: 'white' | 'black'): 'white' | 'black' {
  return mover === 'white' ? 'black' : 'white';
}
