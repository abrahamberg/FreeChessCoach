import { appendFileSync, writeFileSync } from 'node:fs';
import { loadLabels } from './labels.js';
import { paths, readJsonl } from './store.js';
import type { AuditItem, Label, Surface } from './types.js';

export const TARGET = 0.98;
/** Judged sentences per surface before an accuracy counts as measured. */
export const MIN_JUDGED = 300;

export type Outcome = 'correct' | 'wrong' | 'unclear' | null;

/** A judge's label wins; without one a failed code check is wrong and a
 * settled description is correct; anything else is still unjudged (null). */
export function outcomeOf(item: AuditItem, labels: Map<string, Label>): Outcome {
  const label = labels.get(item.key);
  if (label) return label.verdict === 'correct' ? 'correct' : label.verdict === 'unclear' ? 'unclear' : 'wrong';
  if (item.checks.some((check) => !check.ok)) return 'wrong';
  return item.settled ? 'correct' : null;
}

interface Tally {
  total: number;
  correct: number;
  wrong: number;
  unjudged: number;
}

function tally(items: AuditItem[], labels: Map<string, Label>): Tally {
  const counts: Tally = { total: items.length, correct: 0, wrong: 0, unjudged: 0 };
  for (const item of items) {
    const outcome = outcomeOf(item, labels);
    if (outcome === 'correct') counts.correct += 1;
    else if (outcome === 'wrong') counts.wrong += 1;
    else if (outcome === null) counts.unjudged += 1;
  }
  return counts;
}

/** 95% Wilson interval's lower edge. */
function wilsonLow(correct: number, n: number): number {
  if (!n) return 0;
  const z = 1.96;
  const p = correct / n;
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

function accuracyLine(name: string, counts: Tally): string {
  const judged = counts.correct + counts.wrong;
  const accuracy = judged ? counts.correct / judged : 0;
  const status = judged < MIN_JUDGED ? `needs ${MIN_JUDGED - judged} more judged` : accuracy >= TARGET ? 'MEETS 98%' : 'below 98%';
  return `| ${name} | ${judged} | ${counts.wrong} | ${judged ? pct(accuracy) : '-'} | ${judged ? pct(wilsonLow(counts.correct, judged)) : '-'} | ${counts.unjudged} | ${status} |`;
}

/** The accuracy table (scored sample only), the per-source breakdown, and
 * what the code checks fail on across the whole corpus. Holdout gets only
 * the numbers: fixes are never tuned on its sentences. */
export function writeReport(onlySplit: 'dev' | 'holdout' | null): string {
  const items = readJsonl<AuditItem>(paths.items);
  const labels = loadLabels();
  const splits = onlySplit ? [onlySplit] : (['dev', 'holdout'] as const);
  const surfaces: Surface[] = ['review', 'dossier'];
  const rows = ['# Review audit', '', `${items.length} sentences from ${new Set(items.map((item) => item.gameId)).size} games; ${labels.size} labels in the ledger.`, ''];
  rows.push('## Accuracy of the scored sample (sentences code cannot settle alone)', '', '| split / surface | judged | wrong | accuracy | 95% low | unjudged | status |', '|---|---|---|---|---|---|---|');
  for (const split of splits) {
    for (const surface of surfaces) rows.push(accuracyLine(`${split} ${surface}`, tally(items.filter((item) => item.split === split && item.surface === surface && item.sampled), labels)));
  }
  rows.push('', '## Code-check failures over every sentence (dev)', '', '| source | sentences | fail a check | top check |', '|---|---|---|---|');
  const dev = items.filter((item) => item.split === 'dev');
  for (const [source, group] of groupBy(dev, (item) => item.source).sort((a, b) => failures(b[1]) - failures(a[1]))) {
    if (!failures(group)) continue;
    rows.push(`| ${source} | ${group.length} | ${failures(group)} (${pct(failures(group) / group.length)}) | ${topCheck(group)} |`);
  }
  rows.push('', '## Sample by source (dev): where the judged errors are', '', '| source | judged | wrong | accuracy |', '|---|---|---|---|');
  for (const [source, group] of groupBy(dev.filter((item) => item.sampled), (item) => item.source).sort((a, b) => tally(b[1], labels).wrong - tally(a[1], labels).wrong)) {
    const counts = tally(group, labels);
    const judged = counts.correct + counts.wrong;
    if (judged) rows.push(`| ${source} | ${judged} | ${counts.wrong} | ${pct(counts.correct / judged)} |`);
  }
  rows.push('', '## Judged errors by tag (dev)', '');
  for (const [tag, group] of groupBy(dev.filter((item) => outcomeOf(item, labels) === 'wrong' && labels.has(item.key)), (item) => labels.get(item.key)?.tag ?? 'untagged').sort((a, b) => b[1].length - a[1].length)) {
    rows.push(`- ${tag}: ${group.length} (e.g. "${group[0]?.text ?? ''}" — ${labels.get(group[0]?.key ?? '')?.note ?? ''})`);
  }
  const text = rows.join('\n');
  writeFileSync(paths.report, text + '\n');
  return text;
}

function failures(items: AuditItem[]): number {
  return items.filter((item) => item.checks.some((check) => !check.ok)).length;
}

function topCheck(items: AuditItem[]): string {
  const counts = new Map<string, number>();
  for (const item of items) for (const check of item.checks) if (!check.ok) counts.set(check.check, (counts.get(check.check) ?? 0) + 1);
  const [name, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ['-', 0];
  return `${name} (${count})`;
}

export function groupBy<T>(values: T[], key: (value: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const value of values) groups.set(key(value), [...(groups.get(key(value)) ?? []), value]);
  return [...groups];
}

/** One dated line per day's run in `history.md`: the trend toward 98%. */
export function logHistory(): string {
  const items = readJsonl<AuditItem>(paths.items);
  const labels = loadLabels();
  const cells = (['dev', 'holdout'] as const).flatMap((split) =>
    (['review', 'dossier'] as const).map((surface) => {
      const counts = tally(items.filter((item) => item.split === split && item.surface === surface && item.sampled), labels);
      const judged = counts.correct + counts.wrong;
      return `${split} ${surface} ${judged ? pct(counts.correct / judged) : '-'} (n=${judged})`;
    })
  );
  const failing = items.filter((item) => item.split === 'dev' && item.checks.some((check) => !check.ok)).length;
  const line = `- ${new Date().toISOString().slice(0, 10)}: ${cells.join('; ')}; dev code-check failures ${failing}/${items.filter((item) => item.split === 'dev').length}; games ${new Set(items.map((item) => item.gameId)).size}`;
  appendFileSync(paths.history, `${line}\n`);
  return line;
}
