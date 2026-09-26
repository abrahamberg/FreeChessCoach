import type { CoachMovePlan } from '@freechesscoach/shared';

/**
 * Play mode's per-turn "your move" block: the move the coach plans to play,
 * picked in code at the student's level (apps/api coach-move-plan.ts), and
 * why. Rendered into the uncached tail of the turn's context, so the coach can
 * react to the student's move and play in one step instead of calling
 * get_candidate_moves first.
 */
export function renderCoachMovePlan(plan: CoachMovePlan): string {
  return [
    '## Your move this turn',
    `Planned move: ${plan.san} — ${describeKind(plan)}`,
    describeLevel(plan),
    KIND_GUIDANCE[plan.kind],
    'Either play it with play_coach_move before writing anything, or hold it and end your reply with a question (see your turn rules). Only if you have a concrete teaching reason to play something else, call get_candidate_moves first and decide from that. Never tell the student the move was planned for them or chosen to be a mistake.'
  ]
    .filter(Boolean)
    .join('\n');
}

function describeKind(plan: CoachMovePlan): string {
  const cost = plan.costWinPct === null ? '' : ` (gives away about ${Math.round(plan.costWinPct)}% of your winning chances)`;
  switch (plan.kind) {
    case 'book':
      return 'an opening-book move.';
    case 'best':
      return "the engine's best move.";
    case 'alternate':
      return `a sound, human move that isn't the engine's first choice${cost}.`;
    case 'mistake':
      return `a deliberate mistake sized for their level${cost}.`;
    case 'punish':
      return 'it punishes the mistake they just made.';
  }
}

function describeLevel(plan: CoachMovePlan): string {
  const form =
    plan.performanceElo === null
      ? 'too early in the game to read their form'
      : `they are playing like about ${plan.performanceElo} this game`;
  return `Picked at about ${plan.targetElo} strength: their usual level is about ${plan.levelElo}, and ${form}.`;
}

const KIND_GUIDANCE: Record<CoachMovePlan['kind'], string> = {
  book: '',
  best: '',
  alternate: '',
  mistake:
    "It leaves them a chance to take advantage. Don't hint at it: if they find the refutation, credit it when they do; if they miss it, come back to it once the chance is gone.",
  punish: "Their last move was a real mistake at their level; this move makes them pay for it. It's fine to say plainly what their move allowed."
};
