import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The review and the two progress rounds are separate episodes, kept apart by
 * `session_messages.phase`. The coach's own context may only read history
 * through `listForPhase`; a `sessionMessagesRepo.listBySession` here would hand one round the
 * other's messages again. The summarizer, the session detail the web shows and
 * the play and bot commit paths keep the whole-transcript read on purpose.
 */
describe('the coach path reads history by round', () => {
  const dir = __dirname;
  const coachPath = readdirSync(dir).filter(
    (file) =>
      !file.endsWith('.test.ts') &&
      (/^coach-context.*\.ts$/.test(file) || ['coach-agent-turn.ts', 'coach-agent-client-tool-result.ts', 'coach-progress-turn.ts', 'coach-phase.ts'].includes(file))
  );

  it('finds the files it is meant to guard', () => {
    expect(coachPath).toEqual(expect.arrayContaining(['coach-context.ts', 'coach-agent-turn.ts', 'coach-agent-client-tool-result.ts', 'coach-progress-turn.ts', 'coach-phase.ts']));
  });

  it.each(coachPath)('%s does not read the whole transcript', (file) => {
    expect(readFileSync(join(dir, file), 'utf8')).not.toMatch(/sessionMessagesRepo\.listBySession\(/);
  });
});
