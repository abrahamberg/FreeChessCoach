import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** On a public course page for a visitor who is not signed in: the one
 * offer every public page leads with, the no-account review at `/review`
 * (docs/marketing-demo.md). Most visitors arrive from a video about a trap
 * and have a game of their own they lost. */
export function FreeReviewStrip(): ReactNode {
  return (
    <p className="course-player__review-strip">
      <span>Lost a game this week? See every move of it explained in words, with no account.</span>
      <Link className="btn-primary" to="/review">
        Review your own game, free
      </Link>
    </p>
  );
}
