import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { StartShortcuts } from './StartShortcuts.js';

describe('StartShortcuts', () => {
  test('starts a game with the coach or a bot, or imports games', () => {
    render(
      <MemoryRouter>
        <StartShortcuts persona="scholar" quota={{ used: 1, limit: 30 }} />
      </MemoryRouter>
    );
    expect(screen.getByRole('region', { name: 'Play' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Play with Coach/ }).getAttribute('href')).toBe('/play/new');
    expect(screen.getByRole('link', { name: /Play a Bot/ }).getAttribute('href')).toBe('/play-bot/new');
    expect(screen.getByRole('region', { name: 'Import games' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Lichess' }).getAttribute('href')).toBe('/import?tab=lichess');
    expect(screen.getByText('1 of 30 today')).toBeTruthy();
  });
});
