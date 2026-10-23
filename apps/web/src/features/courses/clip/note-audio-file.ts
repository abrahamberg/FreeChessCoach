import { Mp3Encoder } from '@breezystack/lamejs';
import { pauseBefore, type SpokenAudio } from './prepare-audio.js';

const MP3_KBPS = 64;
const MP3_BLOCK = 1152 * 10;

/** One uploadable file per note: the backend's chunks joined, the coach's
 * playback rate baked in (so the public board plays it at 1×, the same for
 * every visitor), as a mono MP3. */
export async function noteAudioFile(audio: SpokenAudio, playbackRate: number): Promise<Blob> {
  const decoder = new OfflineAudioContext(1, 1, 24_000);
  const parts = await Promise.all(audio.chunks.map((chunk) => decoder.decodeAudioData(chunk.slice(0))));
  const sampleRate = parts[0]?.sampleRate ?? 24_000;
  const pauses = parts.map((_, index) => pauseBefore(audio.breaks, index, sampleRate));
  const length = parts.reduce((total, part, index) => total + part.length + pauses[index]!, 0);
  const joined = new Float32Array(length);
  let offset = 0;
  for (const [index, part] of parts.entries()) {
    offset += pauses[index]!;
    joined.set(part.getChannelData(0), offset);
    offset += part.length;
  }
  if (playbackRate === 1) return encodeMp3(joined, sampleRate);

  const source = new OfflineAudioContext(1, Math.max(1, length), sampleRate).createBuffer(1, Math.max(1, length), sampleRate);
  source.copyToChannel(joined, 0);
  const render = new OfflineAudioContext(1, Math.max(1, Math.ceil(length / playbackRate)), sampleRate);
  const node = render.createBufferSource();
  node.buffer = source;
  node.playbackRate.value = playbackRate;
  node.connect(render.destination);
  node.start();
  const rendered = await render.startRendering();
  return encodeMp3(rendered.getChannelData(0), sampleRate);
}

/** PCM samples (-1..1) as a mono MP3. Speech needs little: 64 kbps is about
 * 8 KB a second, a sixth of the WAV, and every browser plays it. */
export function encodeMp3(samples: Float32Array, sampleRate: number): Blob {
  const encoder = new Mp3Encoder(1, sampleRate, MP3_KBPS);
  const pcm = Int16Array.from(samples, (sample) => Math.round(Math.max(-1, Math.min(1, sample)) * 0x7fff));
  const parts: Uint8Array<ArrayBuffer>[] = [];
  for (let at = 0; at < pcm.length; at += MP3_BLOCK) {
    const block = encoder.encodeBuffer(pcm.subarray(at, at + MP3_BLOCK));
    if (block.length) parts.push(Uint8Array.from(block));
  }
  parts.push(Uint8Array.from(encoder.flush()));
  return new Blob(parts, { type: 'audio/mpeg' });
}
