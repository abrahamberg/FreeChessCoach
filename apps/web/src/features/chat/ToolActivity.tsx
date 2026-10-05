import type { ReactNode } from 'react';
import { useCoachActivity } from './coach-activity-context.js';

export interface ToolActivityProps {
  toolName: string | null;
}

/** design.md §5.3: only a handful of tools get a visible "checking a line…"
 * line; update_threads and profile/finding tool frames are backstage
 * (architecture §7.5) and render nothing. */
const VISIBLE_TOOL_MESSAGES: Record<string, string> = {
  get_engine_analysis: '👀 checking a line…'
};

export function ToolActivity({ toolName }: ToolActivityProps): ReactNode {
  // A page that lists the coach's steps (CoachActivityFeed) already shows this.
  const hasFeed = useCoachActivity().length > 0;
  if (!toolName || hasFeed) return null;
  const message = VISIBLE_TOOL_MESSAGES[toolName];
  if (!message) return null;
  return (
    <p className="tool-activity" aria-live="polite">
      {message}
    </p>
  );
}
