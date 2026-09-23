import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test } from 'vitest';
import { LocalVoiceSetup } from './LocalVoiceSetup.js';

afterEach(() => window.localStorage.clear());

describe('LocalVoiceSetup', () => {
  test('links to the setup guide and keeps the port override collapsed', () => {
    render(<LocalVoiceSetup />);
    expect(screen.getByRole('link', { name: /setup guide/i }).getAttribute('href')).toBe('/guide#voice');
    const advanced = screen.getByText(/Advanced: use a different port/i).closest('details');
    expect(advanced?.open).toBe(false);
  });

  test('shows the default port, saves a valid override, and blocks testing an invalid one', async () => {
    const user = userEvent.setup();
    render(<LocalVoiceSetup />);
    const input = screen.getByRole('textbox');
    expect((input as HTMLInputElement).value).toBe('8880');

    await user.clear(input);
    await user.type(input, '9000');
    expect(window.localStorage.getItem('fcc.localTtsPort')).toBe('9000');
    expect(screen.getByRole('button', { name: 'Test voice' }).hasAttribute('disabled')).toBe(false);

    await user.clear(input);
    await user.type(input, '99999');
    expect(screen.getByRole('alert').textContent).toMatch(/1 to 65535/);
    expect(screen.getByRole('button', { name: 'Test voice' }).hasAttribute('disabled')).toBe(true);

    // Leaving it invalid restores the port that is actually saved.
    await user.tab();
    const saved = window.localStorage.getItem('fcc.localTtsPort');
    expect((input as HTMLInputElement).value).toBe(saved);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
