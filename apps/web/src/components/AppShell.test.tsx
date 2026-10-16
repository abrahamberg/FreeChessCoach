import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { AppShell } from './AppShell.js';

describe('AppShell for a visitor who is not signed in', () => {
  test('the top bar offers Sign in; no account menu or tab bar', () => {
    render(
      <MemoryRouter initialEntries={['/learn']}>
        <AppShell guest>
          <p>The courses</p>
        </AppShell>
      </MemoryRouter>
    );
    expect(screen.getByText('The courses')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/oauth2/start?rd=/learn');
    expect(screen.queryByRole('navigation', { name: 'bottom tab bar' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
  });
});
