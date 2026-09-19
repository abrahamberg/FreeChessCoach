#!/usr/bin/env node
/* global console, process */
/* The coach and bot portrait sheets (apps/web/public/brand/coaches.png and
 * bots.png) came with a checkerboard "transparent background" baked into the
 * pixels, so it showed in the corners of the round avatars. This turns that
 * checkerboard into real transparency; the avatar CSS then puts its own
 * gradient behind the portrait.
 *
 * Two passes, both careful about the artwork:
 *  1. Remove checker-coloured pixels connected to the sheet's outer edge, so
 *     light clothing inside a portrait is left alone.
 *  2. Remove the small pockets of checker trapped between strands of hair and
 *     similar. A pocket only goes if it matches the checker's own grid (fitted
 *     from the sheet's margin) and sits near the silhouette, so eye whites,
 *     clock faces and teeth stay.
 * Then the portrait's white sticker outline is faded instead of left as a halo.
 * A sheet that is already transparent at its corner is left alone.
 *
 * Usage: node scripts/clean-avatar-sheets.mjs [file ...]
 * Defaults to both sheets. Rewrites the files in place. */
import { rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const BRAND = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'brand');
const DEFAULT_SHEETS = ['coaches.png', 'bots.png'].map((name) => join(BRAND, name));

/** The checker squares are near-white and near-grey (about 228-255) with some
 * compression noise, and almost colourless. */
const CHECKER_MIN_CHANNEL = 222;
const CHECKER_MAX_SPREAD = 10;
const LIGHT_SQUARE_ABOVE = 240;
/** A pixel matches the fitted grid when this close to the tone predicted there. */
const GRID_TONE_TOLERANCE = 9;
/** Checker is flat, silver hair is not: a pocket's average distance from the
 * predicted tone must stay under this to count as checker. */
const POCKET_MAX_MEAN_DEVIATION = 4;
const GRID_EDGE_SLACK = 1.5;
/** A trapped pocket is removed only if mid-sized and near the silhouette. The floor
 * keeps highlights in silver hair and glints in eyes, which are as flat and grey as checker. */
const POCKET_MIN_PIXELS = 150;
const POCKET_MAX_PIXELS = 1500;
const POCKET_MAX_DISTANCE = 35;
/** Foreground pixels this close to the removed background and still light are
 * the portrait's white sticker outline; they fade out instead of leaving a halo. */
const HALO_REACH = 3;
const HALO_FULL_ALPHA_BELOW = 190;
const HALO_ZERO_ALPHA_ABOVE = 232;

const spreadOf = (data, i) => Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
const lumOf = (data, i) => (data[i] + data[i + 1] + data[i + 2]) / 3;
const isNeutral = (data, i) => spreadOf(data, i) <= CHECKER_MAX_SPREAD;

const isCheckerLike = (data, i) =>
  data[i + 3] < 128 || (Math.min(data[i], data[i + 1], data[i + 2]) >= CHECKER_MIN_CHANNEL && isNeutral(data, i));

/** Marks every checker-like pixel reachable from the sheet's edge. */
function backgroundMask(data, width, height) {
  const mask = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    const p = y * width + x;
    if (mask[p] || !isCheckerLike(data, p * 4)) return;
    mask[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
  while (stack.length > 0) {
    const p = stack.pop();
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  return mask;
}

/** Least-squares fit of `position = offset + size * k` through boundary positions k = 1, 2, ... */
function fitBoundaries(positions) {
  const n = positions.length;
  const ks = positions.map((_, index) => index + 1);
  const meanK = ks.reduce((a, b) => a + b, 0) / n;
  const meanP = positions.reduce((a, b) => a + b, 0) / n;
  const size = ks.reduce((sum, k, index) => sum + (k - meanK) * (positions[index] - meanP), 0) / ks.reduce((sum, k) => sum + (k - meanK) ** 2, 0);
  return { size, offset: meanP - size * meanK };
}

/** The checker's square size and offset per axis, and its two tones, measured on
 * the top-left corner of the sheet, which is always pure background. */
function fitCheckerGrid(data, width) {
  const lum = (x, y) => lumOf(data, (y * width + x) * 4);
  const boundariesAlong = (read, length) => {
    const found = [];
    let previous = read(0) > LIGHT_SQUARE_ABOVE;
    for (let t = 1; t < length; t++) {
      const light = read(t) > LIGHT_SQUARE_ABOVE;
      if (light !== previous) found.push(t);
      previous = light;
    }
    return found;
  };
  const xs = fitBoundaries(boundariesAlong((x) => lum(x, 4), 300).slice(0, 10));
  const ys = fitBoundaries(boundariesAlong((y) => lum(4, y), 100).slice(0, 4));
  const parityAt = (x, y) => (Math.floor((x - xs.offset) / xs.size) + Math.floor((y - ys.offset) / ys.size)) & 1;
  const tones = [[], []];
  for (let y = 2; y < 60; y++) for (let x = 2; x < 60; x++) tones[parityAt(x, y)].push(lum(x, y));
  const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return { xs, ys, parityAt, tone: [median(tones[0]), median(tones[1])] };
}

/** True when the pixel has the colour the checker grid predicts at that spot. */
function matchesGrid(data, width, grid, x, y) {
  return gridDeviation(data, width, grid, x, y) !== null;
}

/** How far the pixel is from the tone the grid predicts there, or null if it is not checker at all.
 * Pixels on a square's edge are anti-aliased, so any light neutral pixel passes there. */
function gridDeviation(data, width, grid, x, y) {
  const i = (y * width + x) * 4;
  if (!isNeutral(data, i)) return null;
  const lum = lumOf(data, i);
  const nearBoundary = (position, { size, offset }) => {
    const within = (((position - offset) % size) + size) % size;
    return Math.min(within, size - within) < GRID_EDGE_SLACK;
  };
  if (nearBoundary(x, grid.xs) || nearBoundary(y, grid.ys)) return lum >= CHECKER_MIN_CHANNEL ? 0 : null;
  const deviation = Math.abs(lum - grid.tone[grid.parityAt(x, y)]);
  return deviation <= GRID_TONE_TOLERANCE ? deviation : null;
}

/** Steps outward from the background, marking how far each pixel is from it (up to `reach`). */
function distanceFromBackground(mask, width, height, reach) {
  const distance = new Uint8Array(width * height);
  let frontier = [];
  for (let p = 0; p < mask.length; p++) if (mask[p]) frontier.push(p);
  for (let step = 1; step <= reach; step++) {
    const next = [];
    for (const p of frontier) {
      const x = p % width;
      const y = (p - x) / width;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (mask[q] || distance[q]) continue;
        distance[q] = step;
        next.push(q);
      }
    }
    frontier = next;
  }
  return distance;
}

/** Adds to the mask every small grid-matching pocket that sits near the silhouette. */
function removeTrappedPockets(data, width, height, mask) {
  const grid = fitCheckerGrid(data, width);
  const nearness = distanceFromBackground(mask, width, height, POCKET_MAX_DISTANCE);
  const seen = new Uint8Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] || seen[start] || !matchesGrid(data, width, grid, start % width, Math.floor(start / width))) continue;
    const pocket = [start];
    seen[start] = 1;
    let closest = nearness[start] || Infinity;
    for (let head = 0; head < pocket.length && pocket.length <= POCKET_MAX_PIXELS; head++) {
      const p = pocket[head];
      const x = p % width;
      const y = (p - x) / width;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (mask[q] || seen[q] || !matchesGrid(data, width, grid, nx, ny)) continue;
        seen[q] = 1;
        pocket.push(q);
        closest = Math.min(closest, nearness[q] || Infinity);
      }
    }
    const flat = pocket.reduce((sum, p) => sum + gridDeviation(data, width, grid, p % width, Math.floor(p / width)), 0) / pocket.length <= POCKET_MAX_MEAN_DEVIATION;
    if (flat && pocket.length >= POCKET_MIN_PIXELS && pocket.length <= POCKET_MAX_PIXELS && closest <= POCKET_MAX_DISTANCE) for (const p of pocket) mask[p] = 1;
  }
}

async function cleanSheet(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (data[3] === 0) {
    console.log(`${file}: already has a transparent background, left alone`);
    return;
  }
  const mask = backgroundMask(data, width, height);
  removeTrappedPockets(data, width, height, mask);
  const distance = distanceFromBackground(mask, width, height, HALO_REACH);
  let removed = 0;
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4;
    if (mask[p]) {
      // Zeroed colour under the transparent pixels: the checker noise otherwise bloats the PNG.
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      removed++;
    } else if (distance[p]) {
      const light = Math.min(data[i], data[i + 1], data[i + 2]);
      const keep = (HALO_ZERO_ALPHA_ABOVE - light) / (HALO_ZERO_ALPHA_ABOVE - HALO_FULL_ALPHA_BELOW);
      data[i + 3] = Math.round(Math.max(0, Math.min(1, keep)) * data[i + 3]);
    }
  }
  await sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(`${file}.tmp`);
  await rename(`${file}.tmp`, file);
  console.log(`${file}: ${width}x${height}, ${((removed / mask.length) * 100).toFixed(1)}% of pixels made transparent`);
}

for (const file of process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_SHEETS) await cleanSheet(file);
