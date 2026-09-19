import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { ImportedGameItem } from '@freechesscoach/shared';
import { BatchAnalysisProgress } from './BatchAnalysisProgress.js';

function game(id: string, analysisStatus: ImportedGameItem['analysisStatus'], black = 'Bob'): ImportedGameItem {
  return {
    id, source: 'lichess', userColor: 'white', whiteName: 'daniel', blackName: black, result: '1-0', timeControl: '600+0',
    playedAt: null, createdAt: '2026-07-20T10:00:00.000Z', analysisStatus, sessionId: null, botId: null, reviewTier: 'imported', estimatedRating: null
  };
}

describe('BatchAnalysisProgress', () => {
  test('shows each game with its own status', () => {
    render(
      <BatchAnalysisProgress
        rows={[
          { gameId: 'a', game: game('a', 'ready', 'Marta') },
          { gameId: 'b', game: game('b', 'engine_running', 'Bob') },
          { gameId: 'c', game: game('c', 'queued', 'Cara') },
          { gameId: 'd', game: game('d', 'failed', 'Dan') }
        ]}
      />
    );

    expect(screen.getByText('daniel vs. Marta').nextSibling).toHaveTextContent('Ready');
    expect(screen.getByText('daniel vs. Bob').nextSibling).toHaveTextContent('Reviewing…');
    expect(screen.getByText('daniel vs. Cara').nextSibling).toHaveTextContent('Waiting to start…');
    expect(screen.getByText('daniel vs. Dan').nextSibling).toHaveTextContent(/couldn.t be analyzed/i);
  });

  test('a paused analysis says it is waiting for the browser, and to keep the tab open', () => {
    render(<BatchAnalysisProgress rows={[{ gameId: 'a', game: game('a', 'paused') }]} />);

    expect(screen.getByText(/waiting for your browser — keep this tab open/i)).toBeInTheDocument();
  });

  test('counts finished games and reminds the reader to keep the tab open until all are done', () => {
    const { rerender } = render(
      <BatchAnalysisProgress rows={[{ gameId: 'a', game: game('a', 'ready') }, { gameId: 'b', game: game('b', 'engine_running') }]} />
    );
    expect(screen.getByText(/1 of 2 analyzed — keep this tab open until they finish/i)).toBeInTheDocument();

    rerender(<BatchAnalysisProgress rows={[{ gameId: 'a', game: game('a', 'ready') }, { gameId: 'b', game: game('b', 'ready') }]} />);
    expect(screen.getByText('2 of 2 analyzed')).toBeInTheDocument();
  });

  test('a game whose details have not loaded still gets a row', () => {
    render(<BatchAnalysisProgress rows={[{ gameId: 'a' }]} />);

    expect(screen.getByText('Imported game')).toBeInTheDocument();
  });
});
