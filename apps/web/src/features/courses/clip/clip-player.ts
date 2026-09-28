import { STINGER_DELAY_MS } from '../../../sounds/board-sounds.js';
import type { BoardSound } from '../../../sounds/move-sounds.js';
import { drawClipFrame, type FrameInput } from './draw-frame.js';
import type { SpokenAudio } from './prepare-audio.js';
import { segmentAt, type ClipTimeline } from './timeline.js';

/** One AudioBuffer per spoken text (the backend's chunks joined). */
export async function decodeCourseAudio(context: BaseAudioContext, prepared: Map<string, SpokenAudio>): Promise<Map<string, AudioBuffer>> {
  const decoded = new Map<SpokenAudio, AudioBuffer>();
  const buffers = new Map<string, AudioBuffer>();
  for (const [key, audio] of prepared) {
    let buffer = decoded.get(audio);
    if (!buffer) {
      // decodeAudioData detaches its input, and the cache still holds it.
      const parts = await Promise.all(audio.chunks.map((chunk) => context.decodeAudioData(chunk.slice(0))));
      buffer = joinBuffers(context, parts);
      decoded.set(audio, buffer);
    }
    buffers.set(key, buffer);
  }
  return buffers;
}

function joinBuffers(context: BaseAudioContext, parts: AudioBuffer[]): AudioBuffer {
  const channels = Math.max(...parts.map((part) => part.numberOfChannels));
  const length = parts.reduce((total, part) => total + part.length, 0);
  const joined = context.createBuffer(channels, Math.max(length, 1), parts[0]?.sampleRate ?? context.sampleRate);
  let offset = 0;
  for (const part of parts) {
    for (let channel = 0; channel < channels; channel++) joined.getChannelData(channel).set(part.getChannelData(Math.min(channel, part.numberOfChannels - 1)), offset);
    offset += part.length;
  }
  return joined;
}

/** Audio length at the persona's playback rate, for buildClipTimeline. */
export function audioLengths(buffers: Map<string, AudioBuffer>, playbackRate: number): Map<string, number> {
  return new Map([...buffers].map(([key, buffer]) => [key, (buffer.duration * 1000) / playbackRate]));
}

export interface ClipPlayerOptions {
  canvas: HTMLCanvasElement;
  context: AudioContext;
  timeline: ClipTimeline;
  buffers: Map<string, AudioBuffer>;
  /** The board sounds (`boardSoundBuffers`), when the clip has them on. */
  soundBuffers?: Record<BoardSound, AudioBuffer> | null;
  playbackRate: number;
  frame: Omit<FrameInput, 'timeline' | 'segment' | 'ms'>;
  onTime?: (ms: number) => void;
  onEnd?: () => void;
}

/** Plays a clip timeline on a canvas with its audio, timed by the audio
 * clock. The preview and the recording both run through here, so what the
 * creator previews is exactly what is recorded. */
export class ClipPlayer {
  private sources: AudioBufferSourceNode[] = [];
  private startedAt = 0;
  private offsetMs = 0;
  private frameRequest = 0;
  private playing = false;
  /** Where the audio goes: the speakers, plus the recorder while recording. */
  readonly output: GainNode;

  constructor(private readonly options: ClipPlayerOptions) {
    this.output = options.context.createGain();
    this.output.connect(options.context.destination);
    this.draw(0);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  position(): number {
    if (!this.playing) return this.offsetMs;
    return Math.min(this.offsetMs + (this.options.context.currentTime - this.startedAt) * 1000, this.options.timeline.durationMs);
  }

  async play(fromMs = this.offsetMs >= this.options.timeline.durationMs ? 0 : this.offsetMs): Promise<void> {
    this.stopSources();
    const { context, timeline, buffers, playbackRate } = this.options;
    if (context.state === 'suspended') await context.resume();
    this.offsetMs = fromMs;
    this.startedAt = context.currentTime;
    const { soundBuffers } = this.options;
    for (const segment of timeline.segments) {
      // The move's sounds first, on the same clock (so the recording has them).
      if (segment.sound && soundBuffers && segment.start >= fromMs) {
        this.schedule(soundBuffers[segment.sound.base], segment.start - fromMs);
        if (segment.sound.stinger) this.schedule(soundBuffers[segment.sound.stinger], segment.start - fromMs + STINGER_DELAY_MS);
      }
      const buffer = segment.audioKey ? buffers.get(segment.audioKey) : undefined;
      const audioStart = segment.start + segment.audioOffsetMs;
      if (!buffer || segment.end <= fromMs) continue;
      const lateMs = Math.max(0, fromMs - audioStart);
      const bufferOffset = (lateMs / 1000) * playbackRate;
      if (bufferOffset >= buffer.duration) continue;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playbackRate;
      source.connect(this.output);
      source.start(this.startedAt + Math.max(0, audioStart - fromMs) / 1000, bufferOffset);
      this.sources.push(source);
    }
    this.playing = true;
    this.tick();
  }

  pause(): void {
    this.offsetMs = this.position();
    this.playing = false;
    this.stopSources();
    cancelAnimationFrame(this.frameRequest);
  }

  seek(ms: number): void {
    const wasPlaying = this.playing;
    this.pause();
    this.offsetMs = Math.max(0, Math.min(ms, this.options.timeline.durationMs));
    this.draw(this.offsetMs);
    if (wasPlaying) void this.play(this.offsetMs);
  }

  destroy(): void {
    this.pause();
    this.output.disconnect();
  }

  private tick = (): void => {
    const ms = this.position();
    this.draw(ms);
    this.options.onTime?.(ms);
    if (ms >= this.options.timeline.durationMs) {
      this.pause();
      this.options.onEnd?.();
      return;
    }
    this.frameRequest = requestAnimationFrame(this.tick);
  };

  private draw(ms: number): void {
    const ctx = this.options.canvas.getContext('2d');
    const segment = segmentAt(this.options.timeline, ms);
    if (ctx && segment) drawClipFrame(ctx, { ...this.options.frame, timeline: this.options.timeline, segment, ms });
  }

  /** A board sound, `inMs` from the moment play started. */
  private schedule(buffer: AudioBuffer, inMs: number): void {
    const source = this.options.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output);
    source.start(this.startedAt + inMs / 1000);
    this.sources.push(source);
  }

  private stopSources(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Never started or already stopped.
      }
      source.disconnect();
    }
    this.sources = [];
  }
}
