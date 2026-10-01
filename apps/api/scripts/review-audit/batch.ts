import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLabels } from './labels.js';
import { renderPosition } from './render.js';
import { groupBy } from './report.js';
import { paths, readJsonl, unitHash } from './store.js';
import type { AuditItem, AuditPosition } from './types.js';

const INSTRUCTIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'judge-instructions.md');

export interface BatchOptions {
  split: 'dev' | 'holdout' | null;
  positions: number;
  count: number;
}

/** Packets for judges: sampled sentences with no label yet, a few positions
 * each, never a sentence already out in a batch nobody has answered. */
export function writeBatches(options: BatchOptions): string[] {
  const labels = loadLabels();
  const pending = pendingKeys();
  const positions = new Map(readJsonl<AuditPosition>(paths.positions).map((position) => [position.key, position]));
  const open = readJsonl<AuditItem>(paths.items).filter((item) => item.sampled && !labels.has(item.key) && !pending.has(item.key) && (!options.split || item.split === options.split));
  // Seeds first (the owner's reports), then a fixed shuffle.
  const groups = groupBy(open, (item) => item.positionKey).sort(([a, x], [b, y]) => Number(y[0]?.gameId.startsWith('seed:')) - Number(x[0]?.gameId.startsWith('seed:')) || unitHash(a) - unitHash(b));
  mkdirSync(paths.batches, { recursive: true });
  const instructions = readFileSync(INSTRUCTIONS, 'utf8');
  const files: string[] = [];
  for (let index = 0; index < options.count; index += 1) {
    const chunk = groups.slice(index * options.positions, (index + 1) * options.positions);
    if (!chunk.length) break;
    const name = `batch-${new Date().toISOString().replace(/[:.]/g, '-')}-${index + 1}`;
    const file = path.join(paths.batches, `${name}.md`);
    const labelFile = path.join(paths.batches, `${name}.labels.jsonl`);
    const body = chunk.flatMap(([key, items]) => {
      const position = positions.get(key);
      return position ? [renderPosition(position, items)] : [];
    });
    writeFileSync(file, [instructions.replaceAll('{{LABEL_FILE}}', labelFile), '', '# Positions', '', body.join('\n\n')].join('\n') + '\n');
    writeFileSync(path.join(paths.batches, `${name}.keys.json`), JSON.stringify(chunk.flatMap(([, items]) => items.map((item) => item.key))));
    files.push(file);
  }
  return files;
}

/** Keys sent out in a batch whose labels have not come back. */
function pendingKeys(): Set<string> {
  if (!existsSync(paths.batches)) return new Set();
  const names = readdirSync(paths.batches);
  const answered = new Set(names.filter((name) => name.endsWith('.ingested.jsonl') || name.endsWith('.labels.jsonl')).map((name) => name.replace(/\.(ingested|labels)\.jsonl$/, '')));
  return new Set(
    names
      .filter((name) => name.endsWith('.keys.json') && !answered.has(name.replace(/\.keys\.json$/, '')))
      .flatMap((name) => JSON.parse(readFileSync(path.join(paths.batches, name), 'utf8')) as string[])
  );
}
