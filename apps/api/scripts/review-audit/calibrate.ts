import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadLabels } from './labels.js';
import { renderPosition } from './render.js';
import { paths, readJsonl, unitHash, WORKSPACE } from './store.js';
import type { AuditItem, AuditPosition } from './types.js';

/** Random judge labels for the owner to agree or disagree with: if the owner
 * disagrees with more than one in ten, `judge-instructions.md` is fixed
 * before the numbers are trusted. Each label comes with every sentence of
 * its move: the first calibration (2026-10-01) showed one sentence alone,
 * and "misses that the queen hangs" was said of moves whose other sentences
 * said exactly that. The pick is fixed by the day, so the file can be
 * written again. */
export function writeCalibration(count: number): string {
  const day = new Date().toISOString().slice(0, 10);
  const labels = loadLabels();
  const items = readJsonl<AuditItem>(paths.items);
  const positions = new Map(readJsonl<AuditPosition>(paths.positions).map((position) => [position.key, position]));
  const judged = items.filter((item) => labels.has(item.key)).sort((a, b) => unitHash(`${day}:${a.key}`) - unitHash(`${day}:${b.key}`));
  const picked: AuditItem[] = [];
  for (const item of judged) {
    if (picked.length < count && !picked.some((each) => each.positionKey === item.positionKey)) picked.push(item);
  }
  const sections = picked.flatMap((item, index) => {
    const position = positions.get(item.positionKey);
    const label = labels.get(item.key);
    if (!position || !label) return [];
    const all = items.filter((each) => each.positionKey === item.positionKey);
    return [
      `## ${index + 1} of ${picked.length}`,
      '',
      `**The label to check:** \`${item.key.slice(0, 10)}\` "${item.text}"`,
      '',
      `**The judge said:** ${label.verdict}${label.tag && label.tag !== 'ok' ? ` (${label.tag})` : ''}. ${label.note}`,
      '',
      'Agree or disagree? Everything said about this move, for context:',
      '',
      renderPosition(position, all, labels),
      ''
    ];
  });
  const file = path.join(WORKSPACE, `calibration-${day}.md`);
  writeFileSync(file, [`# Calibration, ${day}`, '', 'Uppercase is White. Engine scores are from White\'s side (+1.00: White a pawn better; #-3: Black mates in 3). `[review]` rows are shown to the player; `[dossier]` rows are the facts a model gets to write a course.', '', ...sections].join('\n'));
  return file;
}
