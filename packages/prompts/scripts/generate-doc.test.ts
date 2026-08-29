import { describe, test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { renderDoc, outputPath } from './generate-doc.js';

/**
 * The single mechanical guarantee behind "docs/prompts.md can't rot again":
 * regenerate it in memory and diff against the checked-in file. Fails the
 * build (npm test, which CI already runs) if someone edits a prompt builder
 * without running `npm run docs:prompts` — turning AGENTS.md's old, unenforced
 * "update both together" promise into an actual gate.
 */
describe('docs/prompts.md', () => {
  test('matches a fresh generation from packages/prompts/src', async () => {
    const checkedIn = await readFile(outputPath, 'utf8');
    expect(checkedIn).toBe(renderDoc());
  });
});
