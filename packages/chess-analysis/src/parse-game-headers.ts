export interface ParsedGameHeaders {
  whiteElo: number | null;
  blackElo: number | null;
  /** True when either side's rating carries Lichess/Chess.com's `?`
   * provisional-rating suffix (e.g. `"1500?"`) or is bare `"?"`. */
  ratingsProvisional: boolean;
  /** Lichess embeds this in `Event` ("Rated Blitz game" / "Casual Blitz
   * game") rather than a dedicated tag; Chess.com's PGN export has no
   * equivalent at all, so a Chess.com paste always yields `null` here —
   * only the chess.com API import client (Task 51.6) knows this for sure,
   * from the JSON `rated` field. */
  rated: boolean | null;
  termination: string | null;
  variant: string | null;
  utcTime: string | null;
}

const RATED_PATTERN = /\brated\b/i;
const CASUAL_PATTERN = /\bcasual\b/i;
const ELO_PATTERN = /^(\d+)(\?)?$/;

/**
 * Normalizes the rating/rated/termination/variant/time headers that
 * `game-import.ts` doesn't capture today — Lichess and Chess.com PGN exports
 * spell some of these differently, so this is the one place that reconciles
 * them into a single shape (docs/diagnose.md §4.2's game-window filtering and
 * gates DQ-03/DQ-08/DQ-12/DQ-13/DQ-15 all read from it downstream). A header
 * that is simply absent from the PGN always yields `null`, never `0` or
 * `''` — those would misrepresent "we don't know" as "measured zero".
 */
export function parseGameHeaders(headers: Record<string, string>): ParsedGameHeaders {
  const white = parseElo(headers['WhiteElo']);
  const black = parseElo(headers['BlackElo']);

  return {
    whiteElo: white.rating,
    blackElo: black.rating,
    ratingsProvisional: white.provisional || black.provisional,
    rated: parseRated(headers),
    termination: nonEmpty(headers['Termination']),
    variant: nonEmpty(headers['Variant']),
    utcTime: nonEmpty(headers['UTCTime'])
  };
}

function parseElo(raw: string | undefined): { rating: number | null; provisional: boolean } {
  if (raw === undefined) return { rating: null, provisional: false };
  const match = ELO_PATTERN.exec(raw.trim());
  if (!match) return { rating: null, provisional: true };
  return { rating: Number(match[1]), provisional: match[2] === '?' };
}

function parseRated(headers: Record<string, string>): boolean | null {
  const event = headers['Event'];
  if (!event) return null;
  if (RATED_PATTERN.test(event)) return true;
  if (CASUAL_PATTERN.test(event)) return false;
  return null;
}

function nonEmpty(raw: string | undefined): string | null {
  return raw && raw.trim().length > 0 ? raw : null;
}
