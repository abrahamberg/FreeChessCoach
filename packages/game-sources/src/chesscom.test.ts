import { describe, expect, test } from 'vitest';
import { ChesscomApiError, createChesscomClient } from './chesscom.js';

const PGN = '[White "Ann"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 1-0';

function fakeFetch(byMonth: Record<string, number | object>): typeof fetch {
  return (async (url: string) => {
    const month = url.split('/games/')[1] ?? '';
    const answer = byMonth[month] ?? 404;
    return typeof answer === 'number' ? new Response('', { status: answer }) : new Response(JSON.stringify(answer), { status: 200 });
  }) as typeof fetch;
}

describe('createChesscomClient', () => {
  test('a month with no games further back is empty, but a 404 on the first month is the error a wrong username gives', async () => {
    const before = new Date(Date.UTC(2026, 10, 15));
    const games = { games: [{ uuid: 'a', pgn: PGN, end_time: Date.UTC(2026, 10, 1) / 1000, time_class: 'blitz' }] };
    const found = await createChesscomClient(fakeFetch({ '2026/11': games })).fetchRecentGames('ann', before);
    expect(found.map((game) => [game.id, game.whiteName, game.result])).toEqual([['a', 'Ann', '1-0']]);
    await expect(createChesscomClient(fakeFetch({})).fetchRecentGames('nobody', before)).rejects.toBeInstanceOf(ChesscomApiError);
  });
});
