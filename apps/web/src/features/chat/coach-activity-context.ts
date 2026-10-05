import { createContext, useContext } from 'react';
import type { ActivityStep } from './coachActivity.js';

/** What the coach did this turn (useCoachChat's `activity`), provided by
 * SessionPage so ChatPane and the mobile PagedMessageCard can show it without a
 * prop through every layer — the same way KickoffFactsContext reaches
 * ThinkingIndicator. Empty elsewhere, where nothing is shown. */
export const CoachActivityContext = createContext<ActivityStep[]>([]);

export function useCoachActivity(): ActivityStep[] {
  return useContext(CoachActivityContext);
}
