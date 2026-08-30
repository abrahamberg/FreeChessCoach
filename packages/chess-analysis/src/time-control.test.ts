import { describe, expect, test } from 'vitest';
import { classifyTimeControl } from './time-control.js';

describe('classifyTimeControl', () => {
  test('classifies Lichess-style "base+increment" as rapid', () => {
    expect(classifyTimeControl('600+5')).toBe('rapid');
  });

  test('classifies a plain-seconds value the same way', () => {
    expect(classifyTimeControl('600')).toBe('rapid');
  });

  test('classifies bullet below the 180s estimate', () => {
    expect(classifyTimeControl('60+0')).toBe('bullet');
    expect(classifyTimeControl('120+0')).toBe('bullet');
  });

  test('classifies blitz in the 180-479s estimate band', () => {
    expect(classifyTimeControl('180+0')).toBe('blitz');
    expect(classifyTimeControl('300+0')).toBe('blitz');
  });

  test('classifies rapid in the 480-1499s estimate band', () => {
    expect(classifyTimeControl('480+0')).toBe('rapid');
    expect(classifyTimeControl('900+10')).toBe('rapid');
  });

  test('classifies classical at or above the 1500s estimate', () => {
    expect(classifyTimeControl('1500+0')).toBe('classical');
    expect(classifyTimeControl('1800+30')).toBe('classical');
  });

  test('folds increment into the estimate (40 * increment)', () => {
    // base 60, increment 30 -> estimate 60 + 40*30 = 1260 -> rapid, not bullet
    expect(classifyTimeControl('60+30')).toBe('rapid');
  });

  test('classifies a days-based value as correspondence', () => {
    expect(classifyTimeControl('1/86400')).toBe('correspondence');
  });

  test('classifies missing or unparseable values as unknown', () => {
    expect(classifyTimeControl(null)).toBe('unknown');
    expect(classifyTimeControl('')).toBe('unknown');
    expect(classifyTimeControl('-')).toBe('unknown');
    expect(classifyTimeControl('not a time control')).toBe('unknown');
  });
});
