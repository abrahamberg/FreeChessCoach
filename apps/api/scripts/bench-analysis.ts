/**
 * Task 77.1 replay benchmark: re-runs every step `runAnalyzeGameJob` does
 * after the engine pass (services/analysis-steps.ts's `runAnalysisSteps`:
 * classify → prevention → report → diagnostics → candidate moments) over
 * games whose engine evals are already stored. No DB writes, no engine calls
 * (since Task 77.2 those steps make none in the real job either).
 *
 * Prints each step's median ms over `--runs` runs (default 3) and the peak
 * heapUsed seen at a step boundary. `--snapshot` writes the annotated PGN,
 * report and observations of every game (from the last run) as JSON, for
 * byte-for-byte output comparisons.
 *
 * Usage: npm run bench:analysis -w apps/api -- --user <id> [--runs <n>] [--snapshot <file>]
 *        npm run bench:analysis -w apps/api -- --game <id> [--runs <n>] [--snapshot <file>]
 * DATABASE_URL defaults to the local docker Postgres.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { countingVerdictDeps, parsePgn, type VerdictCounters } from '@freechesscoach/chess-analysis';
import type { Kysely } from 'kysely';
import { createDb } from '../src/db/index.js';
import * as analysesRepo from '../src/db/repositories/analyses.js';
import * as gamesRepo from '../src/db/repositories/games.js';
import * as usersRepo from '../src/db/repositories/users.js';
import type { Database } from '../src/db/schema.js';
import { runAnalysisSteps, type AnalysisProbes, type AnalysisStepsInput, type AnalysisStepsResult } from '../src/services/analysis-steps.js';
import { createStepTimer, type StepTimer } from '../src/services/step-timer.js';

const DEFAULT_RUNS = 3;
const DEFAULT_DATABASE_URL = 'postgresql://chess_coach:chess_coach@localhost:5432/chess_coach';

interface Skipped {
  gameId: string;
  reason: string;
}

interface RunResult {
  timings: ReadonlyMap<string, number>;
  results: Map<string, AnalysisStepsResult>;
  counters: RunCounters;
}

/** What the single-verdict pass ran (Task 77.5), summed over one run. */
interface RunCounters {
  verdict: VerdictCounters;
  preventionScans: number;
  detectorRuns: number;
}

interface CliArgs {
  user?: string;
  game?: string;
  snapshot?: string;
  runs: number;
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: { user: { type: 'string' }, game: { type: 'string' }, snapshot: { type: 'string' }, runs: { type: 'string' } }
  });
  if (!values.user === !values.game) throw new Error('Pass exactly one of --user <id> or --game <id>.');
  const runs = values.runs === undefined ? DEFAULT_RUNS : Number(values.runs);
  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer.');
  return { ...values, runs };
}

async function loadGames(db: Kysely<Database>, args: { user?: string; game?: string }): Promise<gamesRepo.GameRow[]> {
  if (args.user) return gamesRepo.listByUser(db, args.user);
  const game = args.game ? await gamesRepo.findById(db, args.game) : undefined;
  if (!game) throw new Error(`Game ${args.game ?? ''} not found.`);
  return [game];
}

/** A game is benchmarked only when every position has a stored eval. */
async function loadInputs(db: Kysely<Database>, games: gamesRepo.GameRow[]): Promise<{ inputs: AnalysisStepsInput[]; skipped: Skipped[] }> {
  const inputs: AnalysisStepsInput[] = [];
  const skipped: Skipped[] = [];
  for (const game of games) {
    const analysis = await analysesRepo.findByGameId(db, game.id);
    const evals = analysis ? await analysesRepo.findEngineEvals(db, analysis.id) : [];
    const parsedGame = parsePgn(game.pgn);
    const complete = evals.length === parsedGame.positions.length && evals.every((e, i) => e.fen === parsedGame.positions[i]?.fen);
    if (!complete) {
      skipped.push({ gameId: game.id, reason: evals.length === 0 ? 'no stored evals' : `incomplete evals (${evals.length}/${parsedGame.positions.length})` });
      continue;
    }
    const user = await usersRepo.findById(db, game.userId);
    inputs.push({
      gameId: game.id,
      userId: game.userId,
      userColor: game.userColor,
      userRating: user?.rating ?? null,
      pgn: game.pgn,
      pgnResult: game.result,
      parsedGame,
      evals
    });
  }
  return { inputs, skipped };
}

/** Wraps a timer so heapUsed is sampled at the end of every step. */
function heapSampling(timer: StepTimer, peaks: Map<string, number>): StepTimer {
  return {
    timed: (label, fn) =>
      timer.timed(label, async () => {
        const result = await fn();
        peaks.set(label, Math.max(peaks.get(label) ?? 0, process.memoryUsage().heapUsed));
        return result;
      }),
    timings: () => timer.timings()
  };
}

async function runOnce(inputs: AnalysisStepsInput[], heapPeaks: Map<string, number>): Promise<RunResult> {
  const timer = createStepTimer();
  const sampled = heapSampling(timer, heapPeaks);
  const results = new Map<string, AnalysisStepsResult>();
  const { deps, counters: verdict } = countingVerdictDeps();
  const counters: RunCounters = { verdict, preventionScans: 0, detectorRuns: 0 };
  const probes: AnalysisProbes = {
    verdictDeps: deps,
    onPreventionScan: () => {
      counters.preventionScans += 1;
    },
    onDetectorRun: () => {
      counters.detectorRuns += 1;
    }
  };
  for (const input of inputs) {
    results.set(input.gameId, await runAnalysisSteps(input, sampled, probes));
  }
  return { timings: timer.timings(), results, counters };
}

function printCounters(run: RunResult, positions: number): void {
  const verdicts = [...run.results.values()].flatMap((result) => [...result.verdicts.values()]);
  const byReason = new Map<string, number>();
  for (const verdict of verdicts) {
    const key = verdict ? `${verdict.kind}:${verdict.reason}` : 'null';
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  const { verdict, preventionScans, detectorRuns } = run.counters;
  console.log(`\nverdicts: ${verdicts.length} plies — ${[...byReason.entries()].map(([key, n]) => `${key}=${n}`).join(', ')}`);
  console.log(`checks run: ${Object.entries(verdict.checks).map(([reason, n]) => `${reason}=${n}`).join(', ')}`);
  console.log(`tactic-detector registry runs: classifyTacticChance=${verdict.tacticChances}, materiality witness=${verdict.referenceLines}`);
  console.log(`prevention: ${preventionScans} PV scans of ${positions} positions, ${verdict.threatOutcomes} threat outcomes compared`);
  console.log(`diagnostic detector runs: ${detectorRuns}`);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function printTable(runs: RunResult[], heapPeaks: ReadonlyMap<string, number>, plies: number): void {
  const labels = [...(runs[0]?.timings.keys() ?? [])];
  const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);
  console.log(`\nstep               median ms   peak heap MB   (${runs.length} runs, ${plies} plies)`);
  for (const label of labels) {
    const ms = median(runs.map((run) => run.timings.get(label) ?? 0));
    console.log(`${label.padEnd(18)} ${ms.toFixed(0).padStart(9)}   ${mb(heapPeaks.get(label) ?? 0).padStart(12)}`);
  }
  const total = median(runs.map((run) => [...run.timings.values()].reduce((sum, ms) => sum + ms, 0)));
  console.log(`${'total'.padEnd(18)} ${total.toFixed(0).padStart(9)}   ${mb(Math.max(0, ...heapPeaks.values())).padStart(12)}`);
}

function writeSnapshot(path: string, results: Map<string, AnalysisStepsResult>): void {
  const games = [...results.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([gameId, result]) => ({
      gameId,
      annotatedPgn: result.annotatedPgn,
      report: result.gameReport,
      observations: result.observations,
      verdicts: [...result.verdicts.entries()].filter(([, verdict]) => verdict !== null)
    }));
  writeFileSync(path, `${JSON.stringify({ games }, null, 2)}\n`);
  console.log(`\nSnapshot of ${games.length} game(s) written to ${path}`);
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const db = createDb(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  try {
    const { inputs, skipped } = await loadInputs(db, await loadGames(db, args));
    for (const { gameId, reason } of skipped) console.log(`skipped ${gameId}: ${reason}`);
    console.log(`${inputs.length} game(s) with stored evals, ${skipped.length} skipped.`);
    if (inputs.length === 0) {
      console.log('No games have stored evals yet — re-analyse them once to fill analyses.engine_evals.');
      return;
    }
    const heapPeaks = new Map<string, number>();
    const runs: RunResult[] = [];
    for (let run = 0; run < args.runs; run += 1) runs.push(await runOnce(inputs, heapPeaks));
    printTable(runs, heapPeaks, inputs.reduce((sum, input) => sum + input.parsedGame.positions.length - 1, 0));
    const last = runs[runs.length - 1];
    if (last) printCounters(last, inputs.reduce((sum, input) => sum + input.parsedGame.positions.length, 0));
    if (args.snapshot && last) writeSnapshot(args.snapshot, last.results);
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
