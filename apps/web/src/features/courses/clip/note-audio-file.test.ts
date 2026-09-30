import { describe, expect, test } from 'vitest';
import { encodeWav } from './note-audio-file.js';

describe('encodeWav', () => {
  test('a 16-bit mono WAV header and clamped samples', async () => {
    const blob = encodeWav(new Float32Array([0, 1, -1, 2]), 24_000);
    const view = new DataView(await blob.arrayBuffer());
    const ascii = (at: number) => String.fromCharCode(...new Uint8Array(view.buffer, at, 4));

    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + 8);
    expect([ascii(0), ascii(8), ascii(12), ascii(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect([view.getUint16(22, true), view.getUint32(24, true), view.getUint16(34, true)]).toEqual([1, 24_000, 16]);
    expect([0, 1, 2, 3].map((index) => view.getInt16(44 + index * 2, true))).toEqual([0, 32767, -32767, 32767]);
  });
});
