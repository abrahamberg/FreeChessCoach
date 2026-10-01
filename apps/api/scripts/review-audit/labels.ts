import { existsSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { paths, readJsonl, writeJsonl } from './store.js';
import type { AuditItem, Label, Verdict } from './types.js';

const VERDICTS = new Set<Verdict>(['correct', 'wrong', 'misleading', 'unclear']);

/** Every label ever given, latest per sentence. A sentence whose text
 * changes gets a new key and needs a new label; an unchanged one keeps its. */
export function loadLabels(): Map<string, Label> {
  return new Map(readJsonl<Label>(paths.labels).map((label) => [label.key, label]));
}

interface RawLabel {
  id?: string;
  key?: string;
  verdict?: string;
  note?: string;
  tag?: string;
}

/** Reads judges' label files (the batch ids are key prefixes) into the
 * ledger. With no files: every `batches/*.labels.jsonl` not yet ingested. */
export function ingestLabels(files: string[]): string {
  const items = readJsonl<AuditItem>(paths.items);
  const sources = files.length ? files : pendingLabelFiles();
  const ledger = readJsonl<Label>(paths.labels);
  const problems: string[] = [];
  let added = 0;
  for (const file of sources) {
    for (const raw of readJsonl<RawLabel>(file)) {
      const prefix = raw.key ?? raw.id ?? '';
      const matches = prefix.length >= 8 ? [...new Set(items.filter((item) => item.key.startsWith(prefix)).map((item) => item.key))] : [];
      const verdict = raw.verdict as Verdict;
      if (matches.length !== 1 || !VERDICTS.has(verdict)) {
        problems.push(`${path.basename(file)}: ${JSON.stringify(raw)} — ${matches.length !== 1 ? `${matches.length} sentences match` : 'bad verdict'}`);
        continue;
      }
      ledger.push({ key: matches[0] ?? '', verdict, note: raw.note ?? '', ...(raw.tag ? { tag: raw.tag } : {}), by: path.basename(file), at: new Date().toISOString() });
      added += 1;
    }
    if (!files.length) renameSync(file, file.replace(/\.labels\.jsonl$/, '.ingested.jsonl'));
  }
  writeJsonl(paths.labels, ledger);
  return [`${added} labels from ${sources.length} file(s)`, ...problems].join('\n');
}

function pendingLabelFiles(): string[] {
  if (!existsSync(paths.batches)) return [];
  return readdirSync(paths.batches)
    .filter((file) => file.endsWith('.labels.jsonl'))
    .map((file) => path.join(paths.batches, file));
}
