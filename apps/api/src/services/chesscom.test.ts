import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createChesscomClient } from './chesscom.js';

const CURRENT_MONTH_FIXTURE = {
  games: [
    {
      uuid: 'abcd1234',
      end_time: 1721476800,
      rated: true,
      time_class: 'rapid',
      time_control: '600',
      pgn: '[White "daniel"]\n[Black "Marta"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0',
      white: { username: 'daniel', rating: 1500 },
      black: { username: 'Marta', rating: 1520 }
    },
    {
      uuid: 'efgh5678',
      end_time: 1721390400,
      rated: false,
      time_class: 'blitz',
      time_control: '300',
      pgn: '[White "Bob"]\n[Black "daniel"]\n[Result "0-1"]\n\n1. d4 d5 0-1',
      white: { username: 'Bob', rating: 1400 },
      black: { username: 'daniel', rating: 1510 }
    }
  ]
};

/** A real fetch() returns a fresh Response per call; mockResolvedValue would
 * hand back the same instance every time, and a body can only be read once. */
function jsonResponse(body: unknown, status = 200): () => Response {
  return () => new Response(JSON.stringify(body), { status });
}

describe('createChesscomClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-25T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('fetches the current month archive and parses each game into a recent-game row, surfacing rated/timeClass/ratings', async () => {
    const fetchMock = vi.fn().mockImplementation(jsonResponse({ games: [] })).mockImplementationOnce(jsonResponse(CURRENT_MONTH_FIXTURE));
    const client = createChesscomClient(fetchMock as unknown as typeof fetch);

    const games = await client.fetchRecentGames('daniel');

    expect(fetchMock).toHaveBeenCalledWith('https://api.chess.com/pub/player/daniel/games/2024/07');
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({
      id: 'abcd1234',
      whiteName: 'daniel',
      blackName: 'Marta',
      result: '1-0',
      timeControl: '600',
      rated: true,
      timeClass: 'rapid',
      whiteRating: 1500,
      blackRating: 1520
    });
    expect(games[1]).toMatchObject({ id: 'efgh5678', rated: false, timeClass: 'blitz', whiteRating: 1400, blackRating: 1510 });
  });

  test('sorts by end_time descending, most recent game first', async () => {
    const fetchMock = vi.fn().mockImplementation(jsonResponse({ games: [] })).mockImplementationOnce(jsonResponse(CURRENT_MONTH_FIXTURE));
    const client = createChesscomClient(fetchMock as unknown as typeof fetch);

    const games = await client.fetchRecentGames('daniel');

    expect(games[0]!.id).toBe('abcd1234');
    expect(games[1]!.id).toBe('efgh5678');
  });

  test('falls back to the previous month when the current month has fewer than the limit', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ games: [CURRENT_MONTH_FIXTURE.games[0]] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ games: [CURRENT_MONTH_FIXTURE.games[1]] }), { status: 200 }));
    const client = createChesscomClient(fetchMock as unknown as typeof fetch);

    const games = await client.fetchRecentGames('daniel');

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.chess.com/pub/player/daniel/games/2024/07');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://api.chess.com/pub/player/daniel/games/2024/06');
    expect(games).toHaveLength(2);
  });

  test('does not fetch a previous month once the current month alone reaches the limit', async () => {
    const fullMonth = { games: Array.from({ length: 20 }, (_, i) => ({ ...CURRENT_MONTH_FIXTURE.games[0], uuid: `game-${i}` })) };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fullMonth), { status: 200 }));
    const client = createChesscomClient(fetchMock as unknown as typeof fetch);

    const games = await client.fetchRecentGames('daniel');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(games).toHaveLength(20);
  });

  test('rolls over correctly at a January boundary', async () => {
    vi.setSystemTime(new Date('2024-01-15T00:00:00.000Z'));
    const fetchMock = vi.fn().mockImplementation(jsonResponse({ games: [] }));
    const client = createChesscomClient(fetchMock as unknown as typeof fetch);

    await client.fetchRecentGames('daniel');

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.chess.com/pub/player/daniel/games/2024/01');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://api.chess.com/pub/player/daniel/games/2023/12');
  });

  test('throws when the Chess.com API responds with a non-2xx status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));
    const client = createChesscomClient(fetchMock as unknown as typeof fetch);

    await expect(client.fetchRecentGames('nobody')).rejects.toThrow();
  });

  test('handles an empty games list', async () => {
    const fetchMock = vi.fn().mockImplementation(jsonResponse({ games: [] }));
    const client = createChesscomClient(fetchMock as unknown as typeof fetch);

    const games = await client.fetchRecentGames('nogames');

    expect(games).toEqual([]);
  });
});
