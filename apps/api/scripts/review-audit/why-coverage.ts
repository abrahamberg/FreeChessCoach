import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NativeEngineBackend } from '../../src/services/engine/native-engine-backend.js';
import { analyseGame } from './analyze.js';
import { StoredEvalsEngine } from './stored-engine.js';
import { WORKSPACE } from './store.js';

/**
 * The coverage number for the "why" notes (the `review-why-pass` skill): joins
 * what `review-why-analyst` agents said was the decisive difference of each
 * move with what the app's Game Review says on the same ply today.
 *
 *   npx tsx apps/api/scripts/review-audit/why-coverage.ts [--out report.json]
 *
 * Reads `.review-audit/why/games/<id>.pgn` + `<id>.evals.json` and
 * `.review-audit/why/answers/<id4>-<n>.json` (id4 = the first four characters
 * of the game id). Needs the dev engine for the course dossier part of the
 * analysis only; the review moves come from the stored evals.
 *
 * An entry the agent found a concrete difference for is `silent` (the app
 * says nothing), `thin` (only a generic note) or `text` (some other note: it
 * says something, not that it says the right thing). The number to move is
 * (silent + thin) over all concrete entries.
 */
interface Answer {
  ply: number;
  entry_type?: string;
  kind: string;
  decisive_difference: string;
  rule?: string;
}
interface AppMove {
  ply: number;
  moveSan: string;
  quality: string;
  reasons?: string[];
}

const GENERIC = /^(Develops|Trades |Recaptures|Theory|Castles|Puts the rook)|was better: it (develops|takes the)/;
const games = path.join(WORKSPACE, 'why', 'games');
const answers = path.join(WORKSPACE, 'why', 'answers');
const outAt = process.argv.indexOf('--out');

const rows: { game: string; ply: number; san: string; quality: string; type: string; kind: string; decisive: string; coverage: string; app: string[] }[] = [];
const native = new NativeEngineBackend('http://localhost:8081');
for (const file of readdirSync(games).filter((name) => name.endsWith('.pgn'))) {
  const id = file.slice(0, -4);
  const evals = path.join(games, `${id}.evals.json`);
  const found = readdirSync(answers).filter((name) => name.startsWith(id.slice(0, 4) + '-'));
  if (!existsSync(evals) || !found.length) continue;
  const analysed = await analyseGame(
    { id, source: 'db', band: 'x', split: 'dev', readerSide: 'black', pgn: readFileSync(path.join(games, file), 'utf8'), focusPly: null, evalsFile: null } as never,
    new StoredEvalsEngine(evals, native)
  );
  const moves = analysed.reviewMoves as unknown as AppMove[];
  for (const name of found) {
    for (const answer of JSON.parse(readFileSync(path.join(answers, name), 'utf8')) as Answer[]) {
      const move = moves.find((each) => each.ply === answer.ply);
      if (!move) continue;
      const reasons = move.reasons ?? [];
      const coverage = !reasons.length ? 'silent' : reasons.every((reason) => GENERIC.test(reason)) ? 'thin' : 'text';
      rows.push({ game: id.slice(0, 4), ply: answer.ply, san: move.moveSan, quality: move.quality, type: answer.entry_type ?? 'MISS', kind: answer.kind, decisive: answer.decisive_difference, coverage, app: reasons });
    }
  }
}

const concrete = rows.filter((row) => row.kind !== 'no_concrete_difference');
const count = (list: typeof rows, key: 'coverage' | 'kind') => Object.entries(list.reduce<Record<string, number>>((all, row) => ({ ...all, [row[key]]: (all[row[key]] ?? 0) + 1 }), {})).sort().map(([name, n]) => `${name} ${n}`).join(', ');
console.log(`${rows.length} entries; no concrete difference: ${rows.length - concrete.length}`);
console.log(`concrete by kind: ${count(concrete, 'kind')}`);
console.log(`concrete by coverage: ${count(concrete, 'coverage')}`);
const gap = concrete.filter((row) => row.coverage !== 'text').length;
console.log(`GAP (silent + thin) / concrete: ${gap}/${concrete.length} = ${((100 * gap) / Math.max(1, concrete.length)).toFixed(1)}%`);
if (outAt >= 0) writeFileSync(process.argv[outAt + 1] ?? 'why-coverage.json', JSON.stringify(rows, null, 1));
