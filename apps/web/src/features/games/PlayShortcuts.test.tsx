import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { PlayShortcuts } from './PlayShortcuts.js';

describe('PlayShortcuts', () => {
  test('starts a game with the coach or a bot', () => {
    render(
      <MemoryRouter>
        <PlayShortcuts persona="scholar" />
      </MemoryRouter>
    );
    expect(screen.getByRole('region', { name: 'Play' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Play with Coach/ }).getAttribute('href')).toBe('/play/new');
    expect(screen.getByRole('link', { name: /Play a Bot/ }).getAttribute('href')).toBe('/play-bot/new');
  });
});
