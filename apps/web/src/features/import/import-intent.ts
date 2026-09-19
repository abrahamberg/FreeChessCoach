/** What a single-game import is for — chosen up front, on the button pressed,
 * so that when analysis finishes the reader lands straight in it: the free
 * move-by-move review, or a coaching session. */
export type ImportIntent = 'review' | 'coach';

export const IMPORT_INTENT_LABELS: Record<ImportIntent, string> = {
  review: 'Analyze',
  coach: 'Get coaching session'
};

export const IMPORT_INTENTS: readonly ImportIntent[] = ['review', 'coach'];
