import { SharedReviewSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiGet } from '../../api/client.js';
import { AppShell } from '../../components/AppShell.js';
import { browserEngineLines } from '../free-review/browser-lines.js';
import { EngineLinesProvider } from '../live-review/engine-lines-source.js';
import { GameReviewView } from '../review/GameReviewView.js';
import './SharedReviewPage.css';

/** Where a shared review sends its visitor: the free review, tagged so the
 * site's numbers can tell these visits apart. */
export const OWN_REVIEW_LINK = '/review?utm_source=share&utm_medium=link&utm_campaign=shared-review';

/**
 * `/shared/:token` (growth plan A6): a review its owner shared by link, for
 * anyone, read-only. The board, the moves and every note are the owner's
 * stored review; nothing about the owner's account is sent. Explore runs on
 * the visitor's own engine, as on `/review`, so nothing here spends server
 * work beyond the one read. A turned-off or wrong link is "not found".
 */
export function SharedReviewPage(): ReactNode {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const review = useQuery({
    queryKey: ['shared-review', token],
    queryFn: ({ signal }) => apiGet(`/api/public/shared-reviews/${encodeURIComponent(token)}`, SharedReviewSchema, signal),
    retry: false,
    staleTime: Infinity
  });

  if (!review.data) {
    return (
      <AppShell guest>
        <div className="page shared-review">
          {review.isPending ? (
            <p>Loading the review…</p>
          ) : (
            <>
              <h1>This review is not shared</h1>
              <p>The link is wrong, or its owner turned it off.</p>
              <Link className="btn-primary" to={OWN_REVIEW_LINK}>
                Review your own game, free
              </Link>
            </>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell guest bare>
      <div data-review-state="ready" className="game-review-contents">
        <EngineLinesProvider source={browserEngineLines}>
          <GameReviewView
            game={{ ...review.data, tacticBaseline: null }}
            coachPersona="general"
            onBack={() => navigate(OWN_REVIEW_LINK)}
            showPly={review.data.keyPly}
            notice={
              <p className="shared-review__notice">
                <span className="shared-review__lead">A shared Game Review: every move explained in words.</span>
                <Link className="btn-primary shared-review__cta" to={OWN_REVIEW_LINK}>
                  Review your own game, free
                </Link>
              </p>
            }
          />
        </EngineLinesProvider>
      </div>
    </AppShell>
  );
}
