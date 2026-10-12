import { describe, expect, test } from 'vitest';
import { courseSlug, courseTitle } from './intake-text.js';

describe('courseTitle', () => {
  test('the PGN event names the course', () => {
    expect(courseTitle('[Event "Evans Gambit"]\n\n1. e4 e5', 'A long direction for club players. Second sentence.')).toBe('Evans Gambit');
  });

  test('without a usable event, the direction names it', () => {
    expect(courseTitle('[Event "?"]\n\n1. e4 e5', 'Englund Gambit trap for beginners. Make them feel it.')).toBe('Englund Gambit trap for beginners');
    expect(courseTitle('1. e4 e5', '')).toBe('Untitled course');
  });
});

// The owner (2026-10-11): links a person can read, /learn/stafford-gambit, not a random tail.
describe('courseSlug', () => {
  test('is the title in words; a taken one counts up', () => {
    expect(courseSlug('Stafford Gambit')).toBe('stafford-gambit');
    expect(courseSlug("Petrov's Défense: opening")).toBe('petrovs-defense-opening');
    expect(courseSlug('Stafford Gambit', ['stafford-gambit', 'stafford-gambit-trap'])).toBe('stafford-gambit-2');
    expect(courseSlug('Stafford Gambit', ['stafford-gambit', 'stafford-gambit-2'])).toBe('stafford-gambit-3');
    expect(courseSlug('???')).toBe('course');
  });

  // The owner (2026-10-11): the link is right from the start, never renamed by hand.
  test('leaves the kind of lesson off the end', () => {
    expect(courseSlug('Stafford Gambit trap')).toBe('stafford-gambit');
    expect(courseSlug("Noah's Ark Trap")).toBe('noahs-ark');
    expect(courseSlug('Trap the queen')).toBe('trap-the-queen');
    expect(courseSlug('Trap')).toBe('trap');
    expect(courseSlug('Stafford Gambit trap', ['stafford-gambit'])).toBe('stafford-gambit-2');
  });
});
