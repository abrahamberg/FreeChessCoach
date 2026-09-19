import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client.js';
import { setDemoRuntime } from '../../demo/demoRuntime.js';
import { startFailureMessage } from './startFailureMessage.js';

afterEach(() => setDemoRuntime(null));

describe('startFailureMessage', () => {
  it('is the generic retry message for a normal failure', () => {
    expect(startFailureMessage(new ApiError(500, 'boom', { title: 'Internal' }))).toBe('Could not start a game. Please try again.');
  });

  it('shows the demo refusal reason instead, because retrying would never help', () => {
    setDemoRuntime({} as never);
    const error = new ApiError(403, 'refused', { title: 'Sign in to play.' });
    expect(startFailureMessage(error)).toBe('Sign in to play.');
  });

  it('keeps the generic message in the demo for an error that carries no reason', () => {
    setDemoRuntime({} as never);
    expect(startFailureMessage(new Error('network'))).toBe('Could not start a game. Please try again.');
  });
});
