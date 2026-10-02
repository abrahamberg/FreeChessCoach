import { loadLabels } from './labels.js';
import { renderPosition } from './render.js';
import { groupBy } from './report.js';
import { paths, readJsonl } from './store.js';
import type { AuditItem, AuditPosition } from './types.js';

/** Every sentence of one game (or one move of it), as a judge would see it:
 * how to reproduce an owner's report. */
export function showGame(gameIdPart: string, where: string | null): string {
  const labels = loadLabels();
  const positions = readJsonl<AuditPosition>(paths.positions).filter((position) => position.gameId.includes(gameIdPart) && (!where || position.where === where || position.moveLabel === where));
  const keys = new Set(positions.map((position) => position.key));
  const items = groupBy(readJsonl<AuditItem>(paths.items).filter((item) => keys.has(item.positionKey)), (item) => item.positionKey);
  const byKey = new Map(positions.map((position) => [position.key, position]));
  return items.flatMap(([key, group]) => {
    const position = byKey.get(key);
    return position ? [renderPosition(position, group, labels)] : [];
  }).join('\n\n');
}
