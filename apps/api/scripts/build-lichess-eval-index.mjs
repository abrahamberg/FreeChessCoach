/* global Buffer, URL, console, process */
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
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';

let LICHESS_EVAL_KEY_SIZE;
let LICHESS_EVAL_MAGIC;
let LICHESS_EVAL_MAX_LINES;
let LICHESS_EVAL_RECORD_SIZE;
let packEntry;
let scanDepthForRank;
if (isMainThread) {
  ({
    LICHESS_EVAL_KEY_SIZE,
    LICHESS_EVAL_MAGIC,
    LICHESS_EVAL_MAX_LINES,
    LICHESS_EVAL_RECORD_SIZE,
    packEntry
  } = await import('@freechesscoach/chess-analysis/lichess-eval-index-format'));
  ({ scanDepthForRank } = await import('@freechesscoach/chess-analysis'));
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_PATH = path.join(scriptDirectory, '../data/lichess-eval-index.bin');

// Bucketing by the key's first byte bounds each bucket to roughly 1/256th of
// the full dataset (~40MB for the real ~10GB index) — small enough to sort
// in memory, without ever holding the full ~394M-record dataset in RAM at
// once. Concatenating the buckets in ascending order (0x00..0xFF), each
// internally sorted, yields one globally sorted file.
const BUCKET_COUNT = 256;
const DEFAULT_WORKER_COUNT = Math.max(1, availableParallelism() - 1);

/** @typedef {{ cp: number|null, mate: number|null, pvUci: string[] }} ParsedLine */
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
 * consumer of this index only ever wants that many), harvesting up to
 * `scanDepthForRank(rank)` UCI moves from each pv's `line` (Phase 49) — a
 * short `pv.line` just yields fewer plies than that rank's ceiling. Returns
 * null for a line this build has no usable evaluation for — malformed JSON, no evals, no
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

  const lines = best.pvs.slice(0, LICHESS_EVAL_MAX_LINES).flatMap((pv, rank) => {
    if (typeof pv?.line !== 'string') return [];
    const pvUci = pv.line.split(' ').filter(Boolean).slice(0, scanDepthForRank(rank));
    if (pvUci.length === 0) return [];

    const hasCp = typeof pv.cp === 'number';
    const hasMate = typeof pv.mate === 'number';
    if (hasCp === hasMate) return []; // exactly one of cp/mate must be present

    return [
      {
        cp: hasCp ? clamp(pv.cp, CP_INT16_MIN, CP_INT16_MAX) : null,
        mate: hasMate ? clamp(pv.mate, MATE_INT8_MIN, MATE_INT8_MAX) : null,
        pvUci
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
 * BUCKET_COUNT comment above for why a full in-memory sort isn't needed. The
 * independent bucket sorts run in parallel across a bounded worker pool.
 *
 * @param {{ lines: AsyncIterable<string>, outputPath: string, tmpDir: string, workerCount?: number }} options
 * @returns {Promise<{ recordCount: number, skippedLines: number }>}
 */
export async function buildLichessEvalIndex({ lines, outputPath, tmpDir, workerCount = getWorkerCount() }) {
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

  await concatenateSortedBuckets(tmpDir, outputPath, getWorkerCount(workerCount));
  return { recordCount, skippedLines };
}

function bucketPath(tmpDir, index) {
  return path.join(tmpDir, `bucket-${String(index).padStart(3, '0')}.bin`);
}

function sortedBucketPath(tmpDir, index) {
  return path.join(tmpDir, `sorted-${String(index).padStart(3, '0')}.bin`);
}

function closeWriteStream(stream) {
  return new Promise((resolve, reject) => stream.end((error) => (error ? reject(error) : resolve())));
}

function getWorkerCount(requested = Number(process.env.LICHESS_EVAL_BUILD_WORKERS ?? DEFAULT_WORKER_COUNT)) {
  if (!Number.isInteger(requested) || requested < 1) return DEFAULT_WORKER_COUNT;
  return Math.min(requested, BUCKET_COUNT);
}

function partition(items, partitionCount) {
  const partitions = Array.from({ length: partitionCount }, () => []);
  items.forEach((item, index) => partitions[index % partitionCount].push(item));
  return partitions;
}

async function concatenateSortedBuckets(tmpDir, outputPath, workerCount) {
  await sortBucketsInParallel(tmpDir, workerCount);
  const output = await open(outputPath, 'w');
  try {
    await output.write(LICHESS_EVAL_MAGIC);
    for (let index = 0; index < BUCKET_COUNT; index++) {
      const filePath = sortedBucketPath(tmpDir, index);
      const sorted = await readFile(filePath);
      await output.write(sorted);
      await rm(filePath);
      await rm(bucketPath(tmpDir, index));
    }
  } finally {
    await output.close();
  }
}

async function sortBucketsInParallel(tmpDir, workerCount) {
  const bucketIndexes = Array.from({ length: BUCKET_COUNT }, (_, index) => index);
  const workers = await createWorkers(tmpDir, workerCount, 'sort');
  try {
    const assignments = partition(bucketIndexes, workers.length);
    await Promise.all(assignments.map((indexes, index) => sendWorkerMessage(workers[index], { indexes })));
  } finally {
    await terminateWorkers(workers);
  }
}

async function createWorkers(tmpDir, workerCount, mode) {
  return Array.from({ length: workerCount }, (_, workerIndex) =>
    new Worker(new URL(import.meta.url), {
      workerData: { mode, tmpDir, workerIndex, recordSize: LICHESS_EVAL_RECORD_SIZE, keySize: LICHESS_EVAL_KEY_SIZE }
    })
  );
}

function sendWorkerMessage(worker, message) {
  return new Promise((resolve, reject) => {
    const onMessage = (result) => {
      worker.off('error', onError);
      resolve(result);
    };
    const onError = (error) => {
      worker.off('message', onMessage);
      reject(error);
    };
    worker.once('message', onMessage);
    worker.once('error', onError);
    worker.postMessage(message);
  });
}

async function terminateWorkers(workers) {
  await Promise.all(workers.map((worker) => worker.terminate()));
}

function sortRecords(buffer, recordSize = LICHESS_EVAL_RECORD_SIZE, keySize = LICHESS_EVAL_KEY_SIZE) {
  const count = buffer.length / recordSize;
  const offsets = Array.from({ length: count }, (_, i) => i * recordSize);
  offsets.sort((a, b) =>
    Buffer.compare(buffer.subarray(a, a + keySize), buffer.subarray(b, b + keySize))
  );
  return Buffer.concat(offsets.map((offset) => buffer.subarray(offset, offset + recordSize)));
}

async function runWorker() {
  parentPort?.on('message', async ({ indexes }) => {
    for (const bucketIndex of indexes) {
      const sorted = sortRecords(
        await readFile(bucketPath(workerData.tmpDir, bucketIndex)),
        workerData.recordSize,
        workerData.keySize
      );
      await writeFile(sortedBucketPath(workerData.tmpDir, bucketIndex), sorted);
    }
    parentPort?.postMessage({ done: true });
  });
}

function openInputStream(inputPath) {
  if (!inputPath.endsWith('.zst')) return createReadStream(inputPath);

  const zstd = spawn('zstd', ['-T0', '-dc', inputPath], { stdio: ['ignore', 'pipe', 'inherit'] });
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
  const workerCount = getWorkerCount();
  console.log(`Building with ${workerCount} workers (override with LICHESS_EVAL_BUILD_WORKERS).`);

  const { recordCount, skippedLines } = await buildLichessEvalIndex({ lines, outputPath, tmpDir, workerCount });
  await rm(tmpDir, { recursive: true, force: true });

  if (recordCount === 0) {
    // A silent zero-record "success" is worse than a crash here: a swallowed
    // failure (e.g. a bad input path) would produce an unusable index.
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

if (!isMainThread) {
  runWorker().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
