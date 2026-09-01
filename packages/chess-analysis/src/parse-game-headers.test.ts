import { describe, expect, test } from 'vitest';
import { parseGameHeaders } from './parse-game-headers.js';

const LICHESS_HEADERS: Record<string, string> = {
  Event: 'Rated Blitz game',
  Site: 'https://lichess.org/zFCbLgLe',
  Date: '2026.08.12',
  White: 'Ann',
  Black: 'Bob',
  Result: '1-0',
  UTCDate: '2026.08.12',
  UTCTime: '12:34:56',
  WhiteElo: '1500',
  BlackElo: '1520',
  Variant: 'Standard',
  TimeControl: '300+0',
  ECO: 'B01',
  Termination: 'Normal'
};

// Chess.com's PGN export has no equivalent of Lichess's Event-embedded
// "Rated"/"Casual" wording — a plain paste never yields a `rated` value.
const CHESSCOM_HEADERS: Record<string, string> = {
  Event: 'Live Chess',
  Site: 'Chess.com',
  Date: '2026.08.12',
  White: 'Ann',
  Black: 'Bob',
  Result: '1-0',
  UTCDate: '2026.08.12',
  UTCTime: '12:34:56',
  WhiteElo: '1500',
  BlackElo: '1520',
  TimeControl: '600',
  Termination: 'Ann won by checkmate'
};

describe('parseGameHeaders', () => {
  test('a full Lichess header block normalizes ratings, rated (from Event), termination, variant and utcTime', () => {
    expect(parseGameHeaders(LICHESS_HEADERS)).toEqual({
      whiteElo: 1500,
      blackElo: 1520,
      ratingsProvisional: false,
      rated: true,
      termination: 'Normal',
      variant: 'Standard',
      utcTime: '12:34:56'
    });
  });

  test('a full Chess.com header block normalizes to the same shape, rated unknown', () => {
    expect(parseGameHeaders(CHESSCOM_HEADERS)).toEqual({
      whiteElo: 1500,
      blackElo: 1520,
      ratingsProvisional: false,
      rated: null,
      termination: 'Ann won by checkmate',
      variant: null,
      utcTime: '12:34:56'
    });
  });

  test('a casual Lichess game reads rated: false', () => {
    expect(parseGameHeaders({ ...LICHESS_HEADERS, Event: 'Casual Blitz game' }).rated).toBe(false);
  });

  test('missing headers yield null, never 0 or empty string', () => {
    expect(parseGameHeaders({})).toEqual({
      whiteElo: null,
      blackElo: null,
      ratingsProvisional: false,
      rated: null,
      termination: null,
      variant: null,
      utcTime: null
    });
  });

  test('a provisional rating (? suffix) is flagged', () => {
    const result = parseGameHeaders({ ...LICHESS_HEADERS, WhiteElo: '1500?' });
    expect(result.whiteElo).toBe(1500);
    expect(result.ratingsProvisional).toBe(true);
  });

  test('a bare "?" rating (no numeric value at all) is null and provisional', () => {
    const result = parseGameHeaders({ ...LICHESS_HEADERS, BlackElo: '?' });
    expect(result.blackElo).toBeNull();
    expect(result.ratingsProvisional).toBe(true);
  });
});
