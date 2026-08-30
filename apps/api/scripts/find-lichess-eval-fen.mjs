/* global console, process */
// Manual lookup CLI for the pre-built Lichess evaluation index (see
// data/README.md and src/services/engine/lichess-eval-index.ts) — lets you
// check whether a given FEN's position was found in the dataset without
// spinning up the API. Uses the exact same reader (binary search over the
// on-disk file) the app uses at runtime, so a hit/miss here matches
// production behavior exactly, FEN normalization included.
//
// Usage:
//   npx tsx scripts/find-lichess-eval-fen.mjs "<fen>" [pathToBin]
//
// pathToBin defaults to $LICHESS_EVAL_INDEX_PATH, then data/lichess-eval-index.bin.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LichessEvalIndex } from '../src/services/engine/lichess-eval-index.ts';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BIN_PATH = path.join(scriptDirectory, '../data/lichess-eval-index.bin');

async function run() {
  const fen = process.argv[2];
  const binPath = process.argv[3] ?? process.env.LICHESS_EVAL_INDEX_PATH ?? DEFAULT_BIN_PATH;
  if (!fen) {
    console.error('Usage: find-lichess-eval-fen.mjs "<fen>" [pathToBin]');
    process.exitCode = 1;
    return;
  }

  const index = await LichessEvalIndex.open(binPath);
  try {
    const result = await index.lookup(fen);
    if (!result) {
      console.log(`NOT FOUND: "${fen}"`);
      return;
    }
    console.log(`FOUND: depth ${result.depth}, ${result.lines.length} line(s):`);
    for (const line of result.lines) {
      const evaluation = line.mate !== null ? `mate in ${line.mate}` : `${line.cp} cp`;
      console.log(`  ${line.moveUci}: ${evaluation}`);
    }
  } finally {
    await index.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
