import type { MoveQuality } from '@freechesscoach/shared';
import { BANNER_PNG } from './banner-sprite.generated.js';
import { PIECE_ORDER, PIECE_SPRITE_PNG } from './piece-sprite.generated.js';
import { createRaster, decodePng, encodePng, type Raster } from './png.js';

/** Open Graph's usual card size. */
const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 35;
/** Keep in step with scripts/build-share-image-sprites.mjs. */
const SQUARE = 70;
type Rgb = readonly [number, number, number];
const BACKGROUND: Rgb = [0xfa, 0xf9, 0xf7];
/** The app's board (apps/web board-canvas.ts). */
const LIGHT: Rgb = [0xf0, 0xd9, 0xb5];
const DARK: Rgb = [0xb5, 0x88, 0x63];
/** The key move's squares, tinted with its verdict (apps/web tokens.css). */
const MOVE_TINTS: Partial<Record<MoveQuality, Rgb>> = {
  blunder: [0xc0, 0x39, 0x2b],
  miss: [0xa8, 0x47, 0x7a],
  mistake: [0xd9, 0x62, 0x2b],
  inaccuracy: [0xc9, 0xa2, 0x27]
};
const LAST_MOVE: Rgb = [0x82, 0xbe, 0x82];

export interface ShareImageInput {
  fen: string;
  /** The key move as UCI ("e2e4"), or null at the start position. */
  uci: string | null;
  quality: MoveQuality | null;
  orientation: 'white' | 'black';
}

let sprites: { pieces: Raster; banner: Raster } | null = null;
function loadSprites(): { pieces: Raster; banner: Raster } {
  sprites ??= { pieces: decodePng(Buffer.from(PIECE_SPRITE_PNG, 'base64')), banner: decodePng(Buffer.from(BANNER_PNG, 'base64')) };
  return sprites;
}

/** The link preview of a shared review: the key position on the app's
 * board, the key move's squares tinted, and the words beside it. */
export function renderShareImage({ fen, uci, quality, orientation }: ShareImageInput): Buffer {
  const { pieces, banner } = loadSprites();
  const image = createRaster(WIDTH, HEIGHT, BACKGROUND);
  const at = squareOrigin(orientation);
  drawSquares(image, at);
  if (uci) tintMove(image, at, uci, (quality && MOVE_TINTS[quality]) ?? LAST_MOVE);
  drawPieces(image, at, pieces, fen);
  blit(image, banner, 0, 0, banner.width, banner.height, MARGIN * 2 + SQUARE * 8, Math.round((HEIGHT - banner.height) / 2));
  return encodePng(image);
}

type SquareOrigin = (file: number, rank: number) => [number, number];

function squareOrigin(orientation: 'white' | 'black'): SquareOrigin {
  const flipped = orientation === 'black';
  return (file, rank) => [MARGIN + (flipped ? 7 - file : file) * SQUARE, MARGIN + (flipped ? rank : 7 - rank) * SQUARE];
}

function drawSquares(image: Raster, at: SquareOrigin): void {
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const [x, y] = at(file, rank);
      fill(image, x, y, (rank + file) % 2 === 0 ? DARK : LIGHT, 1);
    }
  }
}

function tintMove(image: Raster, at: SquareOrigin, uci: string, tint: Rgb): void {
  for (const square of [uci.slice(0, 2), uci.slice(2, 4)]) {
    const [x, y] = at(square.charCodeAt(0) - 97, Number(square[1]) - 1);
    fill(image, x, y, tint, 0.55);
  }
}

function drawPieces(image: Raster, at: SquareOrigin, pieces: Raster, fen: string): void {
  const rows = (fen.split(' ')[0] ?? '').split('/');
  rows.forEach((row, index) => {
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char);
        continue;
      }
      const code = `${char === char.toUpperCase() ? 'w' : 'b'}${char.toUpperCase()}`;
      const slot = PIECE_ORDER.indexOf(code as (typeof PIECE_ORDER)[number]);
      const [x, y] = at(file, 7 - index);
      if (slot >= 0) blit(image, pieces, slot * SQUARE, 0, SQUARE, SQUARE, x, y);
      file++;
    }
  });
}

/** Fills one square, `opacity` over what is there. */
function fill(image: Raster, x: number, y: number, [r, g, b]: Rgb, opacity: number): void {
  for (let row = y; row < y + SQUARE; row++) {
    for (let column = x; column < x + SQUARE; column++) blend(image.pixels, (row * image.width + column) * 4, r, g, b, opacity);
  }
}

/** Draws part of `source` over `target`, by its own alpha. */
function blit(target: Raster, source: Raster, sx: number, sy: number, width: number, height: number, tx: number, ty: number): void {
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const from = ((sy + row) * source.width + sx + column) * 4;
      const alpha = (source.pixels[from + 3] ?? 0) / 255;
      if (alpha === 0) continue;
      const to = ((ty + row) * target.width + tx + column) * 4;
      blend(target.pixels, to, source.pixels[from] ?? 0, source.pixels[from + 1] ?? 0, source.pixels[from + 2] ?? 0, alpha);
    }
  }
}

function blend(pixels: Uint8Array, at: number, r: number, g: number, b: number, alpha: number): void {
  pixels[at] = Math.round(r * alpha + (pixels[at] ?? 0) * (1 - alpha));
  pixels[at + 1] = Math.round(g * alpha + (pixels[at + 1] ?? 0) * (1 - alpha));
  pixels[at + 2] = Math.round(b * alpha + (pixels[at + 2] ?? 0) * (1 - alpha));
}
