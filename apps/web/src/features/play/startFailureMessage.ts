import { ApiError } from '../../api/client.js';
import { getDemoRuntime } from '../../demo/demoRuntime.js';

const GENERIC = 'Could not start a game. Please try again.';

/** What the start screens say when starting a game fails. In the demo the
 * refusal carries its own reason ("sign in to play"); retrying would never help. */
export function startFailureMessage(error: unknown): string {
  if (getDemoRuntime() && error instanceof ApiError) {
    const title = (error.body as { title?: string } | undefined)?.title;
    if (title) return title;
  }
  return GENERIC;
}
