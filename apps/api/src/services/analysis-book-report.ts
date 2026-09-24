import {
  inBookWalk,
  OPENING_BOOK_SOURCE,
  positionKey,
  resolveOpening,
  type ParsedPosition
} from '@freechesscoach/chess-analysis';
import type { BookReport, PlayerBookReport } from '@freechesscoach/shared';

/** The opening-book part of a game's analysis: which named opening it was
 * and where each player left book. Pure. */
export function buildBookReport(positions: ParsedPosition[]): BookReport {
  const bookWalk = inBookWalk(positions);
  const opening = resolveOpening(positions.map((position) => positionKey(position.fen)));
  const lastBookPly = Math.max(bookWalk.lastBookPly.white, bookWalk.lastBookPly.black);

  return {
    source: OPENING_BOOK_SOURCE,
    eco: opening?.eco ?? null,
    ecoVolume: opening?.ecoVolume ?? null,
    name: opening?.name ?? null,
    family: opening?.family ?? null,
    variation: opening?.variation ?? null,
    namedAtPly: opening?.ply ?? null,
    lastBookPly,
    players: {
      white: buildPlayerBookReport('white', positions, bookWalk),
      black: buildPlayerBookReport('black', positions, bookWalk)
    }
  };
}

function buildPlayerBookReport(
  colour: 'white' | 'black',
  positions: ParsedPosition[],
  bookWalk: ReturnType<typeof inBookWalk>
): PlayerBookReport {
  const leftBook = bookWalk.find((result) => {
    const position = positions[result.ply];
    return result.leftBook !== undefined && position?.mover === colour;
  })?.leftBook;

  return {
    lastBookPly: bookWalk.lastBookPly[colour],
    leftBookPly: leftBook?.ply ?? null,
    leftBookMove: leftBook?.played ?? null,
    bookAlternatives: leftBook?.alternatives ?? []
  };
}
