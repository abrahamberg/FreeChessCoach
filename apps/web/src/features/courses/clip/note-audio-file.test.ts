import { describe, expect, test } from 'vitest';
import { encodeMp3 } from './note-audio-file.js';

describe('encodeMp3', () => {
  test('a second of speech-rate audio becomes a small MP3', async () => {
    const samples = Float32Array.from({ length: 24_000 }, (_, index) => Math.sin(index / 10) * 0.5);
    const blob = encodeMp3(samples, 24_000);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(blob.type).toBe('audio/mpeg');
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]! & 0xe0).toBe(0xe0);
    expect(blob.size).toBeGreaterThan(4_000);
    expect(blob.size).toBeLessThan(12_000);
  });
});
