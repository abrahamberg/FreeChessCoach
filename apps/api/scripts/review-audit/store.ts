import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The audit's workspace: corpus, engine cache, runs, batches and labels.
 * Git ignores it; the labels are the part worth keeping (back it up). */
export const WORKSPACE = process.env.REVIEW_AUDIT_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.review-audit');

export const paths = {
  corpus: path.join(WORKSPACE, 'corpus.jsonl'),
  engineCache: path.join(WORKSPACE, 'engine-cache.json'),
  items: path.join(WORKSPACE, 'run', 'items.jsonl'),
  positions: path.join(WORKSPACE, 'run', 'positions.jsonl'),
  labels: path.join(WORKSPACE, 'labels.jsonl'),
  batches: path.join(WORKSPACE, 'batches'),
  report: path.join(WORKSPACE, 'report.md'),
  history: path.join(WORKSPACE, 'history.md')
};

export function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

export function writeJsonl(file: string, rows: readonly unknown[]): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
}

export function hashOf(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

/** A stable number in [0, 1) for sampling and splits. */
export function unitHash(text: string): number {
  return parseInt(hashOf(text).slice(0, 8), 16) / 0x1_0000_0000;
}
