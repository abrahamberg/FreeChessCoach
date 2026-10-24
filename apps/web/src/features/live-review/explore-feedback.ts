import type { UseExploreFeedbackResult } from '../board/useExploreFeedback.js';
import type { LiveReview } from './useLiveReview.js';

const IDLE: UseExploreFeedbackResult = { status: 'idle', evaluation: null, evalCp: null, arrows: [], highlights: [], note: undefined };

/** A live review in the shape the explore note card and the board take; nothing (no arrows, eval or note) while `active` is false. */
export function exploreFeedbackOf(review: LiveReview, active: boolean): UseExploreFeedbackResult {
  if (!active) return IDLE;
  const status = review.failed > 0 && review.pending === 0 && !review.note ? 'error' : review.pending > 0 && !review.note ? 'loading' : 'ready';
  return { status, evaluation: review.evaluation, evalCp: review.evalCp, arrows: review.arrows, highlights: review.highlights, note: review.note };
}
