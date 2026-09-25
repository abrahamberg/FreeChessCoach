import { parsePgn } from '@freechesscoach/chess-analysis';
import { MAX_PGN_LENGTH } from '@freechesscoach/shared';

export interface LoadedPgn {
  pgn: string;
  fileName: string;
  sizeBytes: number;
  whiteName: string;
  blackName: string;
  result: string;
  moves: number;
}

/** Control characters that never appear in a text PGN (tab, newline and
 * carriage return are fine). A NUL or similar means a binary file renamed to
 * ".pgn". */
// eslint-disable-next-line no-control-regex
const BINARY_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

/** Reads a chosen file as text in the browser and checks it is a PGN. The
 * file itself never leaves the device — the caller sends only the returned
 * text. Throws an Error whose message is safe to show the student. */
export async function readPgnFile(file: File): Promise<LoadedPgn> {
  if (!file.name.toLowerCase().endsWith('.pgn')) {
    throw new Error('Only .pgn files can be used here.');
  }
  // Bytes ≥ characters for text, so a file over the limit can't fit.
  if (file.size > MAX_PGN_LENGTH * 4) {
    throw new Error('That file is too large to be a single game.');
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new Error('Could not read that file. Try again.');
  }
  const pgn = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trim();
  if (!pgn) throw new Error('That file was empty.');
  if (BINARY_CHARS.test(pgn)) throw new Error("That doesn't look like a text PGN file.");
  if (pgn.length > MAX_PGN_LENGTH) throw new Error('That file is too large to be a single game.');

  let parsed: ReturnType<typeof parsePgn>;
  try {
    parsed = parsePgn(pgn);
  } catch {
    throw new Error("Couldn't find a valid game in that file.");
  }
  const moves = parsed.positions.length - 1;
  if (moves < 1) throw new Error("Couldn't find any moves in that file.");

  return {
    pgn,
    fileName: file.name,
    sizeBytes: file.size,
    whiteName: parsed.headers['White'] ?? '?',
    blackName: parsed.headers['Black'] ?? '?',
    result: parsed.headers['Result'] ?? '*',
    moves
  };
}
