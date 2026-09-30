/**
 * How many tools the coach calls per episode (a session and a ply). Read-only.
 *
 *   DATABASE_URL=… npx tsx apps/api/scripts/coach-tool-stats.ts --since 2026-09-01
 */
import { parseArgs } from 'node:util';
import { createDb } from '../src/db/index.js';
import * as sessionMessagesRepo from '../src/db/repositories/session-messages.js';
import type { ToolCallCount } from '../src/db/repositories/session-messages.js';

export function summarize(rows: readonly ToolCallCount[]) {
  const perEpisode = new Map<string, number>();
  const perTool = new Map<string, number>();
  for (const { sessionId, ply, toolName, calls } of rows) {
    perEpisode.set(`${sessionId}:${ply}`, (perEpisode.get(`${sessionId}:${ply}`) ?? 0) + calls);
    perTool.set(toolName, (perTool.get(toolName) ?? 0) + calls);
  }
  const counts = [...perEpisode.values()].sort((a, b) => a - b);
  const percentile = (p: number) => counts[Math.min(counts.length - 1, Math.ceil(p * counts.length) - 1)] ?? 0;
  return {
    sessions: new Set(rows.map((row) => row.sessionId)).size,
    episodes: counts.length,
    mean: counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0,
    median: percentile(0.5),
    p90: percentile(0.9),
    byTool: [...perTool].sort((a, b) => b[1] - a[1])
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { since: { type: 'string' } } });
  if (!values.since || Number.isNaN(Date.parse(values.since))) throw new Error('usage: coach-tool-stats.ts --since 2026-09-01');
  const db = createDb(process.env.DATABASE_URL ?? 'postgresql://chess_coach:chess_coach@localhost:5432/chess_coach');
  try {
    const stats = summarize(await sessionMessagesRepo.toolCallStats(db, new Date(values.since)));
    console.log(`since ${values.since}: ${stats.sessions} sessions, ${stats.episodes} episodes with tool calls`);
    console.log(`tool calls per episode: mean ${stats.mean.toFixed(2)}, median ${stats.median}, 90th percentile ${stats.p90}`);
    for (const [name, calls] of stats.byTool) console.log(`  ${name}: ${calls}`);
  } finally {
    await db.destroy();
  }
}

if (process.argv[1]?.endsWith('coach-tool-stats.ts')) await main();
