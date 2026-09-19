import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getDemoRuntime } from './demoRuntime.js';

/** `/demo/coach`: a stable link to the demo coach conversation for the public
 * pages, which cannot know the recorded session's id. */
export function DemoCoachRedirect(): ReactNode {
  const runtime = getDemoRuntime();
  return <Navigate to={runtime ? `/session/${runtime.coachSessionId}` : '/games'} replace />;
}
