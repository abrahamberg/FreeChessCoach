/** Kokoro pads each synthesized sentence with near-silence at both ends;
 * played back-to-back those pads become an audible pause between sentences.
 * Trims samples below `threshold` from both ends, keeping `padSec` of room
 * so consonants aren't clipped, and returns 16-bit mono PCM WAV bytes. */
export function trimmedWav(samples: Float32Array, sampleRate: number, threshold = 0.01, padSec = 0.06): ArrayBuffer {
  let start = 0;
  let end = samples.length;
  while (start < end && Math.abs(samples[start] ?? 0) < threshold) start += 1;
  while (end > start && Math.abs(samples[end - 1] ?? 0) < threshold) end -= 1;
  const pad = Math.round(sampleRate * padSec);
  start = Math.max(0, start - pad);
  end = Math.min(samples.length, end + pad);
  const length = Math.max(0, end - start);

  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[start + i] ?? 0));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return buffer;
}
