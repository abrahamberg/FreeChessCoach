import { loadLabels } from './labels.js';
import { renderPosition } from './render.js';
import { groupBy } from './report.js';
import { paths, readJsonl } from './store.js';
import type { AuditItem, AuditPosition } from './types.js';

export interface FailureOptions {
  source: string | null;
  check: string | null;
  limit: number;
  split: 'dev' | 'holdout' | null;
}

/** Sentences a code check failed, or a judge called wrong, grouped by
 * position: what a fixer reads. Dev only unless asked: the holdout stays unseen. */
export function printFailures(options: FailureOptions): void {
  const labels = loadLabels();
  const positions = new Map(readJsonl<AuditPosition>(paths.positions).map((position) => [position.key, position]));
  const split = options.split ?? 'dev';
  const failing = readJsonl<AuditItem>(paths.items).filter((item) => {
    if (item.split !== split) return false;
    if (options.source && !item.source.startsWith(options.source)) return false;
    const failed = item.checks.filter((check) => !check.ok && (!options.check || check.check === options.check));
    const judgedWrong = !options.check && ['wrong', 'misleading'].includes(labels.get(item.key)?.verdict ?? '');
    return failed.length > 0 || judgedWrong;
  });
  const groups = groupBy(failing, (item) => item.positionKey).slice(0, options.limit);
  for (const [key, group] of groups) {
    const position = positions.get(key);
    if (position) console.log(`${renderPosition(position, group, labels)}\n`);
  }
  console.log(`${failing.length} failing sentences at ${new Set(failing.map((item) => item.positionKey)).size} positions (showing ${groups.length}).`);
}
