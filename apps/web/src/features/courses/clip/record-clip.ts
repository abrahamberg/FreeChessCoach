import type { ClipPlayer } from './clip-player.js';

/** MP4 first (what Instagram and TikTok take directly), else WebM. */
const RECORDER_TYPES = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

export function pickRecorderType(isSupported: (type: string) => boolean = (type) => MediaRecorder.isTypeSupported(type)): string | null {
  return RECORDER_TYPES.find((type) => isSupported(type)) ?? null;
}

export interface RecordedClip {
  blob: Blob;
  mimeType: string;
  extension: 'mp4' | 'webm';
}

const FRAME_RATE = 30;

/** docs/courses.md §8: records the canvas plus the clip's audio in one pass,
 * by playing the clip from the start through the same player the preview
 * uses. The audio is still heard while recording. */
export function recordClip(player: ClipPlayer, canvas: HTMLCanvasElement, context: AudioContext, onEnd: (listener: () => void) => void): Promise<RecordedClip> {
  const mimeType = pickRecorderType();
  if (!mimeType) return Promise.reject(new Error('This browser cannot record video.'));
  const audio = context.createMediaStreamDestination();
  player.output.connect(audio);
  const stream = new MediaStream([...canvas.captureStream(FRAME_RATE).getVideoTracks(), ...audio.stream.getAudioTracks()]);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  return new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Recording failed.'));
    recorder.onstop = () => {
      player.output.disconnect(audio);
      stream.getTracks().forEach((track) => track.stop());
      const type = recorder.mimeType || mimeType;
      resolve({ blob: new Blob(chunks, { type }), mimeType: type, extension: type.includes('mp4') ? 'mp4' : 'webm' });
    };
    onEnd(() => {
      // A beat for the last frame and the encoder to flush.
      setTimeout(() => recorder.stop(), 200);
    });
    recorder.start(1000);
    void player.play(0);
  });
}
