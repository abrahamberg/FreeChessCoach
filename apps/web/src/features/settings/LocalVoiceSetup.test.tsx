import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test } from 'vitest';
import { LocalVoiceSetup } from './LocalVoiceSetup.js';

afterEach(() => window.localStorage.clear());

const testButton = () => screen.getByRole('button', { name: 'Test voice' });
const addressField = () => screen.getByRole('textbox') as HTMLInputElement;

describe('LocalVoiceSetup', () => {
  test('links to the setup guide and keeps the address field collapsed', () => {
    render(<LocalVoiceSetup persona="general" />);
    expect(screen.getByRole('link', { name: /setup guide/i }).getAttribute('href')).toBe('/guide#voice');
    const advanced = screen.getByText(/Advanced: use a different address or port/i).closest('details');
    expect(advanced?.open).toBe(false);
  });

  test('is a single field that defaults to localhost:8880', () => {
    render(<LocalVoiceSetup persona="general" />);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByLabelText(/key|token/i)).toBeNull();
    expect(addressField().value).toBe('http://localhost:8880');
  });

  test('saves when you leave the field, shows what will be used, and applies the default-port rule', async () => {
    const user = userEvent.setup();
    render(<LocalVoiceSetup persona="general" />);

    await user.clear(addressField());
    await user.type(addressField(), '9000');
    expect(screen.getByRole('note').textContent).toBe('Using http://localhost:9000');
    // Nothing is stored mid-typing.
    expect(window.localStorage.getItem('fcc.localTtsUrl')).toBeNull();
    await user.tab();
    expect(window.localStorage.getItem('fcc.localTtsUrl')).toBe('http://localhost:9000');
    expect(addressField().value).toBe('http://localhost:9000');

    await user.clear(addressField());
    await user.type(addressField(), '192.168.1.5');
    await user.tab();
    expect(window.localStorage.getItem('fcc.localTtsUrl')).toBe('http://192.168.1.5');
  });

  test('blocks testing an unusable address and restores the saved one when you leave it', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('fcc.localTtsUrl', 'http://localhost:9000');
    render(<LocalVoiceSetup persona="general" />);

    await user.clear(addressField());
    await user.type(addressField(), 'ftp://nope');
    expect(screen.getByRole('alert').textContent).toMatch(/Enter an address/);
    expect(testButton().hasAttribute('disabled')).toBe(true);

    await user.tab();
    expect(addressField().value).toBe('http://localhost:9000');
    expect(window.localStorage.getItem('fcc.localTtsUrl')).toBe('http://localhost:9000');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('clearing the field goes back to the default', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('fcc.localTtsUrl', 'http://192.168.1.5:9000');
    render(<LocalVoiceSetup persona="general" />);
    await user.clear(addressField());
    expect(testButton().hasAttribute('disabled')).toBe(false);
    await user.tab();
    expect(window.localStorage.getItem('fcc.localTtsUrl')).toBeNull();
    expect(addressField().value).toBe('http://localhost:8880');
  });
});
