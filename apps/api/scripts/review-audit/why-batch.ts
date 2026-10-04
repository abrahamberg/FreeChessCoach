import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Chess } from 'chess.js';

/**
 * Builds the batch files for a "why is the best move better" pass (the
 * `review-why-pass` skill): every move of one game that was not the engine's
 * best and lost at least `--min-loss` centipawns, with the played line and the
 * best line side by side, cut into `--parts` files for parallel
 * `review-why-analyst` agents.
 *
 *   npx tsx apps/api/scripts/review-audit/why-batch.ts --pgn game.pgn --evals evals.json \
 *     --out <dir> [--reader black] [--min-loss 20] [--good-gap 25] [--skip-plies 6] [--parts 2]
 *
 * `evals.json` is the game's stored evals (`analyses.engine_evals`: one
 * White-perspective eval per position, `evals[ply]` the position after that
 * ply, about five lines each). Writes `why-1.md` … `why-N.md` into `--out`.
 */
interface Line {
  moveSan: string;
  cp: number | null;
  mateIn: number | null;
  pvSan: string[];
}
interface Eval {
  fen: string;
  lines: Line[];
}

function arg(name: string, fallback?: string): string {
  const at = process.argv.indexOf(`--${name}`);
  const value = at >= 0 ? process.argv[at + 1] : fallback;
  if (value === undefined) throw new Error(`missing --${name}`);
  return value;
}

const score = (line: Line): string => (line.mateIn !== null ? `#${line.mateIn}` : ((line.cp ?? 0) / 100).toFixed(2));

const evals = JSON.parse(readFileSync(arg('evals'), 'utf8')) as Eval[];
const chess = new Chess();
chess.loadPgn(readFileSync(arg('pgn'), 'utf8'));
const minLoss = Number(arg('min-loss', '20'));
const skipPlies = Number(arg('skip-plies', '6'));
const parts = Number(arg('parts', '2'));
const goodGap = Number(arg('good-gap', '25'));
const reader = arg('reader', 'the reader');

const rows: string[] = [];
chess.history({ verbose: true }).forEach((move, index) => {
  const before = evals[index];
  const after = evals[index + 1];
  const best = before?.lines[0];
  const playedLine = after?.lines[0];
  if (!before || !after || !best || !playedLine || index < skipPlies) return;
  if (best.moveSan === move.san) {
    const second = before.lines[1];
    const sure = best.mateIn !== null && second?.mateIn === null;
    const gap = best.cp !== null && second?.cp != null ? Math.abs(best.cp - second.cp) : 0;
    if ((!sure && gap < goodGap) || !second || new Chess(before.fen).moves().length < 2) return;
    rows.push(
      [
        `### GOOD ply ${index + 1}: ${Math.ceil((index + 1) / 2)}${index % 2 ? '...' : '.'} ${move.san}   (${move.color === 'w' ? 'White' : 'Black'} to move; the engine's best, ${sure ? 'the only mating line' : `${gap} cp ahead of the next candidate`})`,
        `fen before: ${before.fen}`,
        `BEST (played) ${move.san}: eval ${score(best)}; continuation: ${best.pvSan.slice(0, 7).join(' ')}`,
        `next candidates: ${before.lines.slice(1, 4).map((line) => `${line.moveSan} (${score(line)}) ${line.pvSan.slice(0, 4).join(' ')}`).join(' | ')}`,
        "(evals are from White's point of view, in pawns)",
        ''
      ].join('\n')
    );
    return;
  }
  if (best.cp === null || playedLine.cp === null) return;
  const loss = Math.round((move.color === 'w' ? 1 : -1) * (best.cp - playedLine.cp));
  if (loss < minLoss) return;
  const others = before.lines.slice(1, 4).map((line) => `${line.moveSan} (${score(line)})`).join(', ');
  rows.push(
    [
      `### ply ${index + 1}: ${Math.ceil((index + 1) / 2)}${index % 2 ? '...' : '.'} ${move.san}   (${move.color === 'w' ? 'White' : 'Black'} to move; engine loss ${loss} cp)`,
      `fen before: ${before.fen}`,
      `PLAYED  ${move.san}: eval after ${score(playedLine)}; engine continuation: ${move.san} ${playedLine.pvSan.slice(0, 6).join(' ')}`,
      `BEST    ${best.moveSan}: eval ${score(best)}; continuation: ${best.pvSan.slice(0, 7).join(' ')}`,
      `other candidates: ${others}`,
      "(evals are from White's point of view, in pawns)",
      ''
    ].join('\n')
  );
});

const out = arg('out');
mkdirSync(out, { recursive: true });
const size = Math.ceil(rows.length / parts);
for (let part = 0; part < parts; part++) {
  const chunk = rows.slice(part * size, (part + 1) * size);
  const head = `# Part ${part + 1} of ${parts}. Black/White: ${reader} is the reader. Each entry: a move that was NOT the engine's best.\n\n`;
  writeFileSync(path.join(out, `why-${part + 1}.md`), head + chunk.join('\n'));
}
console.log(`${rows.length} moves in ${parts} files in ${out}`);
