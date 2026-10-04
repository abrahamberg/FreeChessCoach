import { describe, expect, test } from 'vitest';
import { renderProgressDossier, type ProgressDossierInput } from './progress-dossier.js';

const base: ProgressDossierInput = {
  studentName: 'Daniel',
  selfAssessment: 'I blunder pieces',
  areas: [
    {
      label: 'Loose-piece scan',
      code: 'BV-04',
      status: 'active',
      isPrimary: true,
      note: 'Counts defenders when cued; does not scan for loose pieces unprompted.',
      measure: { episodes: 4, opportunities: 20, failureRate: 0.2, confidence: 'probable' },
      results: [
        { gameId: 'a', isNew: false, opportunities: 2, failures: 1 },
        { gameId: 'b', isNew: false, opportunities: 0, failures: 0 },
        { gameId: 'c', isNew: true, opportunities: 1, failures: 0 }
      ]
    }
  ],
  graduated: [
    { label: 'Mate in one', code: 'TA-01', graduatedAt: new Date('2026-09-20T10:00:00Z'), cameBack: true },
    { label: 'Free pieces', code: null, graduatedAt: new Date('2026-09-01T10:00:00Z'), cameBack: false }
  ],
  memory: 'Responds to being asked what the opponent threatens.',
  lessons: [{ endedAt: new Date('2026-10-01T10:00:00Z'), note: 'Worked on checking forcing replies.' }],
  newGames: [{ label: 'vs blitzfox7, lost, 10+0', habits: [{ label: 'Loose-piece scan', opportunities: 1, failures: 0 }] }]
};

describe('renderProgressDossier', () => {
  test('a habit shows the measure and one result per game, and a game without a chance is not a success', () => {
    const text = renderProgressDossier(base);
    expect(text).toContain('Loose-piece scan (BV-04) [active, the main one] — measured over recent games: it failed 4 of 20 chances (20%), probable confidence.');
    expect(text).toContain('Last games, oldest to newest: failed 1 of 2 chances; no chance came up; failed 0 of 1 chance (new).');
  });

  test('a graduated habit says whether it has come back', () => {
    const text = renderProgressDossier(base);
    expect(text).toContain('Mate in one (TA-01), graduated 2026-09-20. It has failed again in a game played since.');
    expect(text).toContain('Free pieces, graduated 2026-09-01. No failure since.');
  });

  test('carries the memory, the lessons with dates and the new games', () => {
    const text = renderProgressDossier(base);
    expect(text).toContain('Responds to being asked what the opponent threatens.');
    expect(text).toContain('- 2026-10-01: Worked on checking forcing replies.');
    expect(text).toContain('- vs blitzfox7, lost, 10+0: Loose-piece scan failed 0 of 1.');
  });

  test('says so when there is nothing yet, instead of leaving a heading empty', () => {
    const text = renderProgressDossier({ ...base, areas: [], graduated: [], memory: null, lessons: [], newGames: [] });
    expect(text).toContain('(no focus areas yet)');
    expect(text).toContain('(nothing has graduated yet)');
    expect(text).toContain('(nothing written yet)');
    expect(text).toContain('(no lesson notes yet)');
    expect(text).toContain('(none)');
  });
});
