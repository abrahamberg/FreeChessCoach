import type { ClassifiedMoveDto, SharedReview } from '@freechesscoach/shared';

/** Where the link's visitor lands: the app's read-only review page, tagged
 * so the site's numbers count visits that came through a shared link. */
export function sharedReviewPagePath(token: string): string {
  return `/shared/${token}?utm_source=share&utm_medium=link&utm_campaign=shared-review`;
}

/**
 * The page behind a share link (`/s/<token>`): the Open Graph and Twitter
 * card tags a chat app or social site reads for the preview (their crawlers
 * run no script, so the app's own page cannot carry them), and an immediate
 * redirect to the review itself for a person. `origin` is the site's own
 * address, because preview tags must be absolute.
 */
export function renderShareCard(review: SharedReview, token: string, origin: string): string {
  const title = `${playerName(review.whiteName, 'White')} vs ${playerName(review.blackName, 'Black')}: every move explained`;
  const description = describeKeyMoment(review);
  const page = sharedReviewPagePath(token);
  const tags = [
    ['og:type', 'website'],
    ['og:site_name', 'FreeChess Coach'],
    ['og:title', title],
    ['og:description', description],
    ['og:url', `${origin}/s/${token}`],
    ['og:image', `${origin}/api/public/shared-reviews/${token}/image.png`],
    ['og:image:width', '1200'],
    ['og:image:height', '630'],
    ['og:image:alt', 'The key position of this game on a chess board']
  ];
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    '<meta name="robots" content="noindex">',
    ...tags.map(([property, content]) => `<meta property="${property}" content="${escapeHtml(content ?? '')}">`),
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta http-equiv="refresh" content="0; url=${escapeHtml(page)}">`,
    '</head><body>',
    `<p><a href="${escapeHtml(page)}">Open the review</a></p>`,
    '</body></html>'
  ].join('\n');
}

function describeKeyMoment(review: SharedReview): string {
  const move = review.classifiedMoves.find((candidate) => candidate.ply === review.keyPly);
  const lead = move && isMistake(move) ? `${moveLabel(move)} was ${verdictPhrase(move.quality)}. See why, move by move. ` : '';
  return `${lead}A free Game Review that explains every move in words. Review your own game, free.`;
}

function isMistake(move: ClassifiedMoveDto): boolean {
  return ['blunder', 'miss', 'mistake', 'inaccuracy'].includes(move.quality);
}

function verdictPhrase(quality: string): string {
  if (quality === 'miss') return 'a missed chance';
  return quality === 'inaccuracy' ? 'an inaccuracy' : `a ${quality}`;
}

function moveLabel(move: ClassifiedMoveDto): string {
  const number = move.moveNumber ?? Math.ceil(move.ply / 2);
  return move.mover === 'white' ? `${number}. ${move.moveSan}` : `${number}...${move.moveSan}`;
}

function playerName(name: string | null, fallback: string): string {
  return name && name.trim() !== '' && name !== '?' ? name.trim() : fallback;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
