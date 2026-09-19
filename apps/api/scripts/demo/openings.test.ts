import { parsePgn } from '@freechesscoach/chess-analysis';
import { describe, expect, it } from 'vitest';
import { DEMO_OPENINGS, UNNAMED_OPENINGS } from './openings.js';

describe('demo openings', () => {
  it.each([...DEMO_OPENINGS, ...UNNAMED_OPENINGS].map((opening) => [opening.name ?? opening.plies.slice(0, 4).join(' '), opening] as const))(
    '%s is a legal line of at least 12 plies',
    (_name, opening) => {
      const movetext = opening.plies.map((ply, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${ply}` : ply)).join(' ');
      expect(() => parsePgn(`[Event "x"]\n\n${movetext} *`)).not.toThrow();
      expect(parsePgn(`[Event "x"]\n\n${movetext} *`).positions.length - 1).toBe(opening.plies.length);
      expect(opening.plies.length).toBeGreaterThanOrEqual(12);
    }
  );

  it('gives each colour a repertoire to choose from', () => {
    expect(DEMO_OPENINGS.filter((o) => o.as === 'white').length).toBeGreaterThanOrEqual(5);
    expect(DEMO_OPENINGS.filter((o) => o.as === 'black').length).toBeGreaterThanOrEqual(5);
  });
});
