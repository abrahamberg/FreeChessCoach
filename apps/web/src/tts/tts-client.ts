import type { CoachPersona } from '@freechesscoach/shared';

export interface TtsSpeakRequest {
  text: string;
  persona: CoachPersona;
}

/** Common shape for both coach-voice backends (kokoro-tts-client.ts,
 * openai-tts-client.ts) so useCoachVoice's queue/cache logic doesn't branch
 * on which one is active — it just calls whichever client the user's
 * `ttsBackend` setting resolves to. `mimeType` matters because the two
 * backends emit different audio containers (WAV vs. MP3), and useCoachVoice
 * blobs the raw bytes it gets back from `speak()`. */
export interface TtsClient {
  mimeType: string;
  /** Mirrors SharedTtsWorker.speak: `onChunk` fires once per chunk (in
   * order) as audio becomes available; the returned promise resolves once
   * the whole message has finished, or rejects on error. A backend that
   * doesn't stream (OpenAI) just delivers one chunk covering the whole
   * message. */
  speak(request: TtsSpeakRequest, onChunk: (index: number, audio: ArrayBuffer) => void): Promise<void>;
}
