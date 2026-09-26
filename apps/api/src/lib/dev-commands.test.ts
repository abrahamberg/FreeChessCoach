import { describe, expect, test } from 'vitest';
import { isDevCommandsEnabled } from './dev-commands.js';

describe('isDevCommandsEnabled', () => {
  test('on only with the opt-in flag on a dev-stub stack', () => {
    expect(isDevCommandsEnabled({ COACH_DEV_COMMANDS: '1', AUTH_MODE: 'dev-stub' })).toBe(true);
  });

  test('off in production even if the flag leaks into its environment', () => {
    expect(isDevCommandsEnabled({ COACH_DEV_COMMANDS: '1', AUTH_MODE: 'proxy' })).toBe(false);
    expect(isDevCommandsEnabled({ COACH_DEV_COMMANDS: '1' })).toBe(false);
  });

  test('off on a dev stack unless opted in', () => {
    expect(isDevCommandsEnabled({ AUTH_MODE: 'dev-stub' })).toBe(false);
    expect(isDevCommandsEnabled({ COACH_DEV_COMMANDS: '0', AUTH_MODE: 'dev-stub' })).toBe(false);
  });
});
