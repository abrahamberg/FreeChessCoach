import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'vitest';
import { markRemoteGameImported } from './markRemoteImported.js';

describe('markRemoteGameImported', () => {
  test('ticks the matching row on every loaded page and leaves the rest alone', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['chesscom-recent-games'], {
      pageParams: ['', 'x'],
      pages: [
        [
          { pgn: 'a', imported: false },
          { pgn: 'b', imported: false }
        ],
        [{ pgn: 'c', imported: true }]
      ]
    });

    markRemoteGameImported(queryClient, 'b');

    expect(queryClient.getQueryData(['chesscom-recent-games'])).toEqual({
      pageParams: ['', 'x'],
      pages: [
        [
          { pgn: 'a', imported: false },
          { pgn: 'b', imported: true }
        ],
        [{ pgn: 'c', imported: true }]
      ]
    });
    // A list never loaded stays unloaded.
    expect(queryClient.getQueryData(['lichess-recent-games'])).toBeUndefined();
  });
});
