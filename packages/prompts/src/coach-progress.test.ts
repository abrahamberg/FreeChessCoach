import { describe, expect, test } from 'vitest';
import { buildProgressSystemPrompt, renderClosingRoundBlock, renderProgressNotesBlock } from './coach-progress.js';
import { baseProgressInput } from './fixtures.js';

describe('buildProgressSystemPrompt', () => {
  test('the static part names no student and no game, so it is shared like the review\'s', () => {
    const a = buildProgressSystemPrompt(baseProgressInput('progress_close'));
    const b = buildProgressSystemPrompt(
      baseProgressInput('progress_close', {
        user: { displayName: 'Zed', selfAssessment: 'x', sessionCount: 40 },
        rating: 900,
        game: { whiteName: 'Zed', blackName: 'Yan', result: '0-1', timeControl: '3+2', userColor: 'black' },
        sessionGoal: 'stop hanging pieces'
      })
    );

    expect(a.staticPart).toBe(b.staticPart);
    expect(a.staticPart).not.toContain('Ann');
  });

  test('each round has its own script and only its own tools', () => {
    const open = buildProgressSystemPrompt(baseProgressInput('progress_open')).staticPart;
    const close = buildProgressSystemPrompt(baseProgressInput('progress_close')).staticPart;

    expect(open).toContain('progress check-in, before the game');
    expect(open).toContain('- begin_review:');
    expect(open).not.toContain('- end_session:');
    expect(close).toContain('closing progress round, after the game');
    expect(close).toContain('- save_progress_notes:');
    expect(close).toContain('- end_session:');
    expect(close).not.toContain('- begin_review:');
  });

  test('both rounds tell the coach a note is general: no move numbers, moves or squares', () => {
    for (const phase of ['progress_open', 'progress_close'] as const) {
      expect(buildProgressSystemPrompt(baseProgressInput(phase)).staticPart).toContain('No move numbers, no moves, no squares');
    }
  });

  test('the dynamic part carries the dossier, and the closing round names the game and its goal', () => {
    const open = buildProgressSystemPrompt(baseProgressInput('progress_open')).dynamicPart;
    expect(open).toContain('## Progress dossier');
    expect(open).toContain('You have not looked at the game yet.');

    const close = buildProgressSystemPrompt(baseProgressInput('progress_close', { sessionGoal: 'stop hanging pieces' })).dynamicPart;
    expect(close).toContain('Ann vs Bob, 1-0, 10+0; they played white');
    expect(close).toContain('The goal this session worked toward: stop hanging pieces');
  });
});

describe('the closing round\'s game notes', () => {
  test('progress notes are listed in the order they were left, with their habit code when they have one', () => {
    const text = renderProgressNotesBlock([
      { diagnosisCode: 'BV-04', note: 'Scanned for loose pieces unprompted.' },
      { diagnosisCode: null, note: 'Needed a prompt to count attackers.' }
    ]);
    expect(text).toBe('## Progress notes for this game\n\n- (BV-04) Scanned for loose pieces unprompted.\n- Needed a prompt to count attackers.');
    expect(renderProgressNotesBlock([])).toContain('(none yet)');
  });

  test('the closing block says it is the closing note about the game and the student\'s progress', () => {
    expect(renderClosingRoundBlock(24)).toContain('This is the closing note about the game and about keeping the student\'s progress.');
    expect(renderClosingRoundBlock(24)).toContain('The last moment you were on was Black\'s move 12.');
  });
});
