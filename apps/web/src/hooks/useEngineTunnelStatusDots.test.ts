import { describe, expect, test } from 'vitest';
import { dotColor, localAiDotColor } from './useEngineTunnelStatusDots.js';

describe('tunnel status dots', () => {
  test('engine dot: red while the socket is down, yellow while connecting or loading, green when ready', () => {
    expect(dotColor('disconnected', true)).toBe('red');
    expect(dotColor('error', true)).toBe('red');
    expect(dotColor('connecting', false)).toBe('yellow');
    expect(dotColor('connected', false)).toBe('yellow');
    expect(dotColor('connected', true)).toBe('green');
  });

  test('local AI dot follows the last local call once the socket is up', () => {
    expect(localAiDotColor('disconnected', 'reachable')).toBe('red');
    expect(localAiDotColor('connected', 'unknown')).toBe('yellow');
    expect(localAiDotColor('connected', 'reachable')).toBe('green');
    expect(localAiDotColor('connected', 'unreachable')).toBe('red');
  });

  test('grey while another tab is the active one', () => {
    expect(dotColor('inactive', true)).toBe('grey');
    expect(localAiDotColor('inactive', 'reachable')).toBe('grey');
  });
});
