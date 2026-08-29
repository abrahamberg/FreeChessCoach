import { describe, expect, test } from 'vitest';
import { formatSpeed, speedTooltip } from './useEngineActivityIndicator.js';

describe('formatSpeed', () => {
  test('whole numbers at or above 10 round to an integer', () => {
    expect(formatSpeed(20)).toBe('20');
    expect(formatSpeed(10.4)).toBe('10');
  });

  test('between 1 and 10 keeps one decimal, trimming a trailing .0', () => {
    expect(formatSpeed(1)).toBe('1');
    expect(formatSpeed(3.25)).toBe('3.3');
  });

  test('below 1 keeps two decimals down to 0.01', () => {
    expect(formatSpeed(0.01)).toBe('0.01');
    expect(formatSpeed(0.5)).toBe('0.50');
  });

  test('below 0.01 is reported as a floor rather than misleading precision', () => {
    expect(formatSpeed(0.001)).toBe('<0.01');
  });
});

describe('speedTooltip', () => {
  test('at or above one position per second, states the rate directly', () => {
    expect(speedTooltip(1)).toBe('About 1 position analyzed per second.');
    expect(speedTooltip(20)).toBe('About 20 positions analyzed per second.');
  });

  test('below one position per second, states seconds per position instead', () => {
    expect(speedTooltip(0.01)).toBe('About 1 position analyzed every 100 seconds.');
  });
});
