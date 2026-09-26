import type { CoachPersona } from '@freechesscoach/shared';

export interface TtsSpeakRequest {
  text: string;
  persona: CoachPersona;
  /** A Settings sample: lets the OpenAI route play it before voice is
   * turned on or switched to OpenAI. */
  preview?: boolean;
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
  /** Gets the backend ready before the first reply needs it — loading the
   * in-browser model, waking a local server — by synthesizing a throwaway
   * word. Best-effort: failures are swallowed, a real speak() reports them.
   * Absent where a warm-up would cost the user money (OpenAI). */
  warmUp?(persona: CoachPersona): void;
}
