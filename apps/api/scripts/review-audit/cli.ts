/**
 * The review audit: runs real games through Game Review and the course
 * dossier, checks every sentence against the board and the engine, hands the
 * rest to judges (Claude Code agents) in batches, and reports accuracy.
 * `.claude/skills/review-audit/SKILL.md` is the loop that uses it.
 *
 *   npm run review:audit -w apps/api -- corpus [--per-band 40] [--stream 100000] [--dump 400000]
 *   npm run review:audit -w apps/api -- run [--only <id>] [--split dev|holdout] [--limit n] [--jobs 2] [--procs 6] [--sample-rate 0.1]
 *   npm run review:audit -w apps/api -- recheck [--sample-rate 0.1]      (the checks again, no analysis)
 *   npm run review:audit -w apps/api -- report [--split dev|holdout] [--log]
 *   npm run review:audit -w apps/api -- failures [--source <prefix>] [--check <name>] [--limit 20]
 *   npm run review:audit -w apps/api -- batch [--split dev|holdout] [--positions 12] [--count 1]
 *   npm run review:audit -w apps/api -- ingest <labels.jsonl>...
 *   npm run review:audit -w apps/api -- calibrate [--count 10]            (labels for the owner to check)
 *   npm run review:audit -w apps/api -- probe --fen <fen> [--moves "Nxe5 Rxd3"] [--depth 18]
 *   npm run review:audit -w apps/api -- show <gameId-part> [--where p25]
 *   npm run review:audit -w apps/api -- seed --game <db game id> --note "<what the owner saw>"
 *
 * The engine is the dev stack's (--engine-url, default http://localhost:8081).
 * Workspace: apps/api/.review-audit (git ignores it).
 */
import { parseArgs } from 'node:util';
import { writeBatches } from './batch.js';
import { writeCalibration } from './calibrate.js';
import { buildCorpus } from './corpus.js';
import { ingestLabels } from './labels.js';
import { printFailures } from './failures.js';
import { probe } from './probe.js';
import { logHistory, writeReport } from './report.js';
import { recheckItems, runAudit } from './run.js';
import { addSeed } from './seed.js';
import { showGame } from './show.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    'per-band': { type: 'string' },
    stream: { type: 'string' },
    dump: { type: 'string' },
    only: { type: 'string' },
    split: { type: 'string' },
    limit: { type: 'string' },
    jobs: { type: 'string' },
    procs: { type: 'string' },
    shard: { type: 'string' },
    'sample-rate': { type: 'string' },
    'engine-url': { type: 'string' },
    positions: { type: 'string' },
    count: { type: 'string' },
    source: { type: 'string' },
    check: { type: 'string' },
    fen: { type: 'string' },
    moves: { type: 'string' },
    depth: { type: 'string' },
    where: { type: 'string' },
    game: { type: 'string' },
    note: { type: 'string' },
    log: { type: 'boolean' }
  }
});

const [command, ...rest] = positionals;
const engineUrl = values['engine-url'] ?? 'http://localhost:8081';
const split = values.split === 'dev' || values.split === 'holdout' ? values.split : null;
const number = (value: string | undefined, fallback: number): number => (value === undefined ? fallback : Number(value));

async function main(): Promise<void> {
  switch (command) {
    case 'corpus': {
      const games = await buildCorpus({ perBand: number(values['per-band'], 40), stream: number(values.stream, 0), dump: number(values.dump, 0) });
      console.log(`${games.length} games in the corpus`);
      return;
    }
    case 'run': {
      const { items } = await runAudit({ engineUrl, only: values.only ?? null, split, limit: values.limit ? Number(values.limit) : null, jobs: number(values.jobs, 2), procs: number(values.procs, 6), sampleRate: number(values['sample-rate'], 0.1), shard: values.shard ?? null });
      if (values.shard) return;
      console.log(`${items.length} sentences checked; ${items.filter((item) => item.checks.some((check) => !check.ok)).length} fail a check; ${items.filter((item) => item.sampled).length} in the scored sample`);
      console.log(writeReport(split));
      return;
    }
    case 'recheck': {
      const items = recheckItems(number(values['sample-rate'], 0.1));
      console.log(`${items.length} sentences checked again; ${items.filter((item) => item.checks.some((check) => !check.ok)).length} fail a check`);
      console.log(writeReport(split));
      return;
    }
    case 'report':
      console.log(writeReport(split));
      if (values.log) console.log(logHistory());
      return;
    case 'failures':
      printFailures({ source: values.source ?? null, check: values.check ?? null, limit: number(values.limit, 20), split });
      return;
    case 'batch':
      for (const file of writeBatches({ split, positions: number(values.positions, 12), count: number(values.count, 1) })) console.log(file);
      return;
    case 'ingest':
      console.log(ingestLabels(rest));
      return;
    case 'calibrate':
      console.log(writeCalibration(number(values.count, 10)));
      return;
    case 'probe':
      if (!values.fen) throw new Error('probe needs --fen');
      console.log(await probe({ engineUrl, fen: values.fen, moves: values.moves?.split(/\s+/).filter(Boolean) ?? [], depth: number(values.depth, 18) }));
      return;
    case 'show':
      console.log(showGame(rest[0] ?? '', values.where ?? null));
      return;
    case 'seed':
      if (!values.game || !values.note) throw new Error('seed needs --game and --note');
      console.log(await addSeed(values.game, values.note));
      return;
    default:
      throw new Error('commands: corpus, run, recheck, report, failures, batch, ingest, calibrate, probe, show, seed');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
