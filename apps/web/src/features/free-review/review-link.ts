/** What a `/review#pgn=…&side=…&ply=…` link asks for: a game to review at
 * once, the side to review it for, and the move to show. The game rides in
 * the hash, so it never reaches the server, not even its logs. The studio's
 * video recorder (`studio record review`) drives the page this way. */
export interface ReviewLink {
  pgn: string | null;
  side: 'white' | 'black';
  /** The game's ply to show (0 is the start), or null for the default. */
  ply: number | null;
}

export function readReviewLink(hash: string): ReviewLink {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const pgn = params.get('pgn')?.trim() || null;
  const side = params.get('side') === 'black' ? 'black' : 'white';
  const plyText = params.get('ply');
  const ply = plyText !== null && /^\d+$/.test(plyText) ? Number(plyText) : null;
  return { pgn, side, ply };
}
