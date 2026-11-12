import { useEffect, useState } from 'react';
import { readReviewLink, type ReviewLink } from './review-link.js';

/** The page's `#pgn=…&side=…&ply=…`, kept current as the hash changes. */
export function useReviewLink(): ReviewLink {
  const [link, setLink] = useState(() => readReviewLink(window.location.hash));
  useEffect(() => {
    const update = (): void => setLink(readReviewLink(window.location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return link;
}
