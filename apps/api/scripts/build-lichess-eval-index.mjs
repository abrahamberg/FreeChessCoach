/* global Buffer, console, process */
// Builds the pre-built, read-only Lichess evaluation index that
// LichessEvalIndex (src/services/engine/lichess-eval-index.ts) serves at
// runtime — see docs/architecture.md's "Lichess evaluation index" section
// and the plan this shipped from for the full design rationale.
//
// Deliberately NOT part of `npm run build:images` or the Helm migrate-job:
// this is a standalone, offline batch job you run by hand (or from whatever
// external scheduler your ops setup already has) against a downloaded
// snapshot of https://database.lichess.org/#evals (or its Hugging Face
// mirror), independently of app deploys — the dataset refreshes monthly
// upstream, the app does not need to redeploy to pick up a new build.
//
// Usage:
//   npx tsx scripts/build-lichess-eval-index.mjs <lichess_db_eval.jsonl[.zst]> [outputPath]
//
// A `.zst` input is decompressed by shelling out to the system `zstd`
// binary (this script's own machine, not the API image — see
// docker/Dockerfile.api's "no native binaries" comment, which applies to
// the *running* API service, not this one-off build tool).
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LICHESS_EVAL_KEY_SIZE,
  LICHESS_EVAL_MAGIC,
  LICHESS_EVAL_MAX_LINES,
  LICHESS_EVAL_RECORD_SIZE,
  compareKeys,
  packEntry
} from '@freechesscoach/chess-analysis/lichess-eval-index-format';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_PATH = path.join(scriptDirectory, '../data/lichess-eval-index.bin');

// Bucketing by the key's first byte bounds each bucket to roughly 1/256th of
// the full dataset (~40MB for the real ~10GB index) — small enough to sort
// in memory, without ever holding the full ~394M-record dataset in RAM at
// once. Concatenating the buckets in ascending order (0x00..0xFF), each
// internally sorted, yields one globally sorted file.
const BUCKET_COUNT = 256;

/** @typedef {{ cp: number|null, mate: number|null, moveUci: string }} ParsedLine */
/** @typedef {{ fen: string, depth: number, lines: ParsedLine[] }} ParsedEntry */

const CP_INT16_MIN = -32768;
const CP_INT16_MAX = 32767;
const MATE_INT8_MIN = -128;
const MATE_INT8_MAX = 127;

/**
 * Parses one line of the official lichess_db_eval.jsonl format:
 * `{"fen": "...", "evals": [{"pvs": [{"cp"|"mate": n, "line": "e2e4 e7e5 ..."}], "knodes": n, "depth": n}, ...]}`
 * (see https://database.lichess.org/#evals for the schema). Picks the
 * deepest `evals` entry and keeps every one of its pvs (up to
 * LICHESS_EVAL_MAX_LINES — the dataset can carry more per entry, but every
 * consumer of this index only ever wants that many). Returns null for a line
 * this build has no usable evaluation for — malformed JSON, no evals, no
 * pvs, or every pv missing cp/mate — rather than throwing: a
 * multi-hundred-million-line dataset having the occasional bad row is
 * expected, and one bad line shouldn't abort the whole build.
 *
 * @param {string} line
 * @returns {ParsedEntry | null}
 */
export function parseLichessEvalLine(line) {
  if (!line.trim()) return null;

  /** @type {any} */
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    return null;
  }

  const fen = row?.fen;
  const evals = row?.evals;
  if (typeof fen !== 'string' || !Array.isArray(evals) || evals.length === 0) return null;

  const best = evals.reduce(
    (deepest, candidate) =>
      typeof candidate?.depth === 'number' && (!deepest || candidate.depth > deepest.depth) ? candidate : deepest,
    /** @type {any} */ (null)
  );
  if (!Array.isArray(best?.pvs)) return null;

  const lines = best.pvs.slice(0, LICHESS_EVAL_MAX_LINES).flatMap((pv) => {
    if (typeof pv?.line !== 'string') return [];
    const moveUci = pv.line.split(' ')[0];
    if (!moveUci) return [];

    const hasCp = typeof pv.cp === 'number';
    const hasMate = typeof pv.mate === 'number';
    if (hasCp === hasMate) return []; // exactly one of cp/mate must be present

    return [
      {
        cp: hasCp ? clamp(pv.cp, CP_INT16_MIN, CP_INT16_MAX) : null,
        mate: hasMate ? clamp(pv.mate, MATE_INT8_MIN, MATE_INT8_MAX) : null,
        moveUci
      }
    ];
  });
  if (lines.length === 0) return null;

  return { fen, depth: best.depth, lines };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Streams `lines` (already-decompressed JSONL), packs each parsed entry into
 * a fixed-width record, and bucket-sorts them into `outputPath` — see the
 * BUCKET_COUNT comment above for why a full in-memory sort isn't needed.
 *
 * @param {{ lines: AsyncIterable<string>, outputPath: string, tmpDir: string }} options
 * @returns {Promise<{ recordCount: number, skippedLines: number }>}
 */
export async function buildLichessEvalIndex({ lines, outputPath, tmpDir }) {
  await mkdir(tmpDir, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });

  const bucketStreams = Array.from({ length: BUCKET_COUNT }, (_, index) => createWriteStream(bucketPath(tmpDir, index)));

  let recordCount = 0;
  let skippedLines = 0;
  try {
    for await (const line of lines) {
      const entry = parseLichessEvalLine(line);
      if (!entry) {
        skippedLines += 1;
        continue;
      }
      const record = packEntry(entry);
      bucketStreams[record[0]].write(record);
      recordCount += 1;
    }
  } finally {
    await Promise.all(bucketStreams.map(closeWriteStream));
  }

  await concatenateSortedBuckets(tmpDir, outputPath);
  return { recordCount, skippedLines };
}

function bucketPath(tmpDir, index) {
  return path.join(tmpDir, `bucket-${String(index).padStart(3, '0')}.bin`);
}

function closeWriteStream(stream) {
  return new Promise((resolve, reject) => stream.end((error) => (error ? reject(error) : resolve())));
}

async function concatenateSortedBuckets(tmpDir, outputPath) {
  const output = await open(outputPath, 'w');
  try {
    await output.write(LICHESS_EVAL_MAGIC);
    for (let index = 0; index < BUCKET_COUNT; index++) {
      const filePath = bucketPath(tmpDir, index);
      const sorted = sortRecords(await readFile(filePath));
      await output.write(sorted);
      await rm(filePath);
    }
  } finally {
    await output.close();
  }
}

function sortRecords(buffer) {
  const count = buffer.length / LICHESS_EVAL_RECORD_SIZE;
  const offsets = Array.from({ length: count }, (_, i) => i * LICHESS_EVAL_RECORD_SIZE);
  offsets.sort((a, b) =>
    compareKeys(buffer.subarray(a, a + LICHESS_EVAL_KEY_SIZE), buffer.subarray(b, b + LICHESS_EVAL_KEY_SIZE))
  );
  return Buffer.concat(offsets.map((offset) => buffer.subarray(offset, offset + LICHESS_EVAL_RECORD_SIZE)));
}

function openInputStream(inputPath) {
  if (!inputPath.endsWith('.zst')) return createReadStream(inputPath);

  const zstd = spawn('zstd', ['-dc', inputPath], { stdio: ['ignore', 'pipe', 'inherit'] });
  zstd.on('error', (error) => {
    throw new Error(`Failed to spawn "zstd" — is it installed on this machine? (${error.message})`);
  });
  return zstd.stdout;
}

/**
 * Splits a byte stream into lines by iterating it directly, rather than via
 * `readline.createInterface` — that wraps the stream in a second object
 * whose own 'line'/'close' listeners can start after the underlying stream
 * has already finished (a real, timing-dependent race we hit building a
 * small fixture index: a few lines went missing depending on how long
 * unrelated setup work took before consumption started). Iterating the
 * stream's own async iterator has no such gap: there's only one consumer,
 * so there's nothing for it to race against.
 *
 * @param {NodeJS.ReadableStream} stream
 * @returns {AsyncGenerator<string>}
 */
export async function* readLines(stream) {
  stream.setEncoding('utf8');
  let buffer = '';
  for await (const chunk of stream) {
    buffer += chunk;
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      yield buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
    }
  }
  if (buffer.length > 0) yield buffer;
}

async function run() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] ?? DEFAULT_OUTPUT_PATH;
  if (!inputPath) {
    console.error('Usage: build-lichess-eval-index.mjs <lichess_db_eval.jsonl[.zst]> [outputPath]');
    process.exitCode = 1;
    return;
  }

  const tmpDir = path.join(path.dirname(outputPath), '.lichess-eval-index-tmp');
  const lines = readLines(openInputStream(inputPath));

  const { recordCount, skippedLines } = await buildLichessEvalIndex({ lines, outputPath, tmpDir });
  await rm(tmpDir, { recursive: true, force: true });

  if (recordCount === 0) {
    // A silent zero-record "success" is worse than a crash here: the caller
    // (fetch-and-build-lichess-eval-index.sh) deletes the downloaded dataset
    // once this process exits 0, so a swallowed failure (e.g. a bad input
    // path) would destroy the only copy of a tens-of-GB download for nothing.
    throw new Error(
      `Built index with 0 positions from "${inputPath}" (${skippedLines} lines skipped) — refusing to treat this as success. Check that the input path is correct and non-empty.`
    );
  }

  const { size } = await stat(outputPath);
  console.log(
    `Built Lichess eval index: ${recordCount} positions (${skippedLines} lines skipped), ` +
      `${(size / 1024 ** 3).toFixed(2)} GB at ${outputPath}`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
