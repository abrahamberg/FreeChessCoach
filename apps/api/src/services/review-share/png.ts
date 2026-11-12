import { crc32, deflateSync, inflateSync } from 'node:zlib';

/** An RGBA picture, 8 bits a channel, rows top to bottom. */
export interface Raster {
  width: number;
  height: number;
  pixels: Uint8Array;
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const RGBA = 6;
const CHANNELS = 4;

export function createRaster(width: number, height: number, [r, g, b]: readonly [number, number, number]): Raster {
  const pixels = new Uint8Array(width * height * CHANNELS);
  for (let index = 0; index < pixels.length; index += CHANNELS) {
    pixels[index] = r;
    pixels[index + 1] = g;
    pixels[index + 2] = b;
    pixels[index + 3] = 255;
  }
  return { width, height, pixels };
}

/** Writes the raster as a PNG: RGBA, no filtering, deflated. */
export function encodePng({ width, height, pixels }: Raster): Buffer {
  const rowBytes = width * CHANNELS;
  const filtered = Buffer.alloc((rowBytes + 1) * height);
  for (let row = 0; row < height; row++) {
    filtered.set(pixels.subarray(row * rowBytes, (row + 1) * rowBytes), row * (rowBytes + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, RGBA, 0, 0, 0], 8);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(filtered)), chunk('IEND', Buffer.alloc(0))]);
}

/** Reads a PNG this repo made (the sprites): 8-bit RGBA, not interlaced. */
export function decodePng(png: Buffer): Raster {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG');
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== RGBA || body[12] !== 0) throw new Error('Only 8-bit RGBA, non-interlaced PNGs are read');
    }
    if (type === 'IDAT') data.push(body);
    offset += length + 12;
  }
  return { width, height, pixels: unfilter(inflateSync(Buffer.concat(data)), width, height) };
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/** Undoes the PNG row filters (none, sub, up, average, Paeth). */
function unfilter(raw: Buffer, width: number, height: number): Uint8Array {
  const rowBytes = width * CHANNELS;
  const out = new Uint8Array(rowBytes * height);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (rowBytes + 1)] ?? 0;
    const source = row * (rowBytes + 1) + 1;
    const target = row * rowBytes;
    for (let column = 0; column < rowBytes; column++) {
      const left = column >= CHANNELS ? (out[target + column - CHANNELS] ?? 0) : 0;
      const up = row > 0 ? (out[target + column - rowBytes] ?? 0) : 0;
      const upLeft = row > 0 && column >= CHANNELS ? (out[target + column - rowBytes - CHANNELS] ?? 0) : 0;
      out[target + column] = ((raw[source + column] ?? 0) + predictor(filter, left, up, upLeft)) & 0xff;
    }
  }
  return out;
}

function predictor(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return (left + up) >> 1;
  if (filter === 4) return paeth(left, up, upLeft);
  return 0;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}
