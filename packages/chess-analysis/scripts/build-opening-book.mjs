/* global console, process */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { positionKey } from '../src/opening-book-key.ts';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(scriptDirectory, '../data/openings.tsv');
const outputPath = path.join(scriptDirectory, '../src/generated/opening-book-index.json');

/**
 * @typedef {{ eco: string, name: string, pgn: string }} OpeningRow
 * @typedef {{ san: string, uci: string, eco: string, name: string }} BookEntry
 * @typedef {{ eco: string, ecoVolume: string, name: string, ply: number }} NameEntry
 * @typedef {{ bookIndex: Record<string, BookEntry[]>, nameIndex: Record<string, NameEntry> }} OpeningBook
 */

/**
 * Builds the book and terminal-name indexes from pre-built opening rows.
 *
 * @param {OpeningRow[]} rows
 * @returns {OpeningBook}
 */
export function buildOpeningBook(rows) {
  /** @type {Record<string, BookEntry[]>} */
  const bookIndex = {};
  /** @type {Record<string, NameEntry>} */
  const nameIndex = {};

  rows.forEach((row, rowIndex) => {
    const ecoVolume = getEcoVolume(row.eco, rowIndex);
    const chess = loadOpening(row, rowIndex);
    const moves = chess.history({ verbose: true });

    for (const move of moves) {
      const key = positionKey(move.before);
      const entries = bookIndex[key] ?? (bookIndex[key] = []);
      if (entries.some((entry) => entry.san === move.san)) continue;

      entries.push({
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion ?? ''}`,
        eco: row.eco,
        name: row.name,
      });
    }

    const terminalKey = positionKey(chess.fen());
    const existing = nameIndex[terminalKey];
    if (!existing || moves.length > existing.ply) {
      nameIndex[terminalKey] = {
        eco: row.eco,
        ecoVolume,
        name: row.name,
        ply: moves.length,
      };
    }
  });

  return {
    bookIndex: sortBookIndex(bookIndex),
    nameIndex: sortNameIndex(nameIndex),
  };
}

/**
 * Parses the tab-separated dataset. Only the fields needed by the index are
 * read; the precomputed UCI and EPD columns are intentionally ignored.
 *
 * @param {string} contents
 * @returns {OpeningRow[]}
 */
export function parseOpeningRows(contents) {
  const [headerLine, ...dataLines] = contents.split(/\r?\n/);
  if (headerLine !== 'eco\tname\tpgn\tuci\tepd') {
    throw new Error('Opening dataset has an unexpected header');
  }

  return dataLines
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const fields = line.split('\t');
      if (fields.length < 3) {
        throw new Error(`Opening dataset row ${index + 2} has too few columns`);
      }

      const [eco, name, pgn] = fields;
      if (!eco || !name || !pgn) {
        throw new Error(`Opening dataset row ${index + 2} has an empty required field`);
      }

      return { eco, name, pgn };
    });
}

function loadOpening(row, rowIndex) {
  const chess = new Chess();
  try {
    chess.loadPgn(row.pgn);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Opening dataset row ${rowIndex + 2} has invalid PGN: ${message}`, {
      cause: error,
    });
  }
  return chess;
}

function getEcoVolume(eco, rowIndex) {
  const volume = eco[0];
  if (!volume || !'ABCDE'.includes(volume)) {
    throw new Error(`Opening dataset row ${rowIndex + 2} has an invalid ECO code: ${eco}`);
  }
  return volume;
}

function sortBookIndex(bookIndex) {
  return Object.fromEntries(
    Object.entries(bookIndex)
      .sort(([leftKey], [rightKey]) => compareStrings(leftKey, rightKey))
      .map(([key, entries]) => [
        key,
        [...entries].sort((left, right) => compareStrings(left.san, right.san)),
      ]),
  );
}

function sortNameIndex(nameIndex) {
  return Object.fromEntries(
    Object.entries(nameIndex).sort(([leftKey], [rightKey]) => compareStrings(leftKey, rightKey)),
  );
}

function compareStrings(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

async function buildFromDataset() {
  const rows = parseOpeningRows(await readFile(inputPath, 'utf8'));
  const openingBook = buildOpeningBook(rows);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(openingBook, null, 2)}\n`);

  console.log(
    `Built opening book: ${Object.keys(openingBook.bookIndex).length} positions, `
      + `${Object.keys(openingBook.nameIndex).length} named terminal positions`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildFromDataset().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
