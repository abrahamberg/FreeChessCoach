import type { SpokenAudio } from './prepare-audio.js';

/** One uploadable file per note: the backend's chunks joined, the coach's
 * playback rate baked in (so the public board plays it at 1×, the same for
 * every visitor), as a 16-bit mono WAV. */
export async function noteAudioFile(audio: SpokenAudio, playbackRate: number): Promise<Blob> {
  const decoder = new OfflineAudioContext(1, 1, 24_000);
  const parts = await Promise.all(audio.chunks.map((chunk) => decoder.decodeAudioData(chunk.slice(0))));
  const sampleRate = parts[0]?.sampleRate ?? 24_000;
  const length = parts.reduce((total, part) => total + part.length, 0);
  const joined = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    joined.set(part.getChannelData(0), offset);
    offset += part.length;
  }
  if (playbackRate === 1) return encodeWav(joined, sampleRate);

  const source = new OfflineAudioContext(1, Math.max(1, length), sampleRate).createBuffer(1, Math.max(1, length), sampleRate);
  source.copyToChannel(joined, 0);
  const render = new OfflineAudioContext(1, Math.max(1, Math.ceil(length / playbackRate)), sampleRate);
  const node = render.createBufferSource();
  node.buffer = source;
  node.playbackRate.value = playbackRate;
  node.connect(render.destination);
  node.start();
  const rendered = await render.startRendering();
  return encodeWav(rendered.getChannelData(0), sampleRate);
}

/** PCM samples (-1..1) as a 16-bit mono WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const ascii = (at: number, text: string): void => [...text].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 0x7fff), true));
  return new Blob([bytes], { type: 'audio/wav' });
}
