export interface PgnFilenameInput {
  whiteName: string | null;
  blackName: string | null;
  playedAt: Date | null;
  createdAt: Date;
}

/**
 * Builds a filesystem/header-safe filename for a game's PGN download —
 * "white-vs-black-YYYY-MM-DD.pgn" — used as the `Content-Disposition`
 * attachment filename by `GET /api/games/:id/pgn`. Falls back to "unknown"
 * for a missing player name, and the game's own `createdAt` when it has no
 * `playedAt` (an in-app bot/coach game has no imported "played at" date).
 */
export function pgnFilename(game: PgnFilenameInput): string {
  const date = (game.playedAt ?? game.createdAt).toISOString().slice(0, 10);
  const white = sanitize(game.whiteName);
  const black = sanitize(game.blackName);
  return `${white}-vs-${black}-${date}.pgn`;
}

function sanitize(name: string | null): string {
  const cleaned = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'unknown';
}
