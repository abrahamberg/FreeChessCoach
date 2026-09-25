import { kokoroSynthesisSpeed } from './persona-voices.js';
import { getSharedTtsWorker } from './shared-tts-worker-instance.js';
import type { TtsClient } from './tts-client.js';

/** Adapts SharedTtsWorker (persona -> Kokoro voice and speed, sentence-by-sentence
 * WAV chunks) to the common TtsClient shape. */
export const kokoroTtsClient: TtsClient = {
  mimeType: 'audio/wav',
  speak(request, onChunk) {
    return getSharedTtsWorker().speak({ text: request.text, ...kokoroSynthesisSpeed(request.persona) }, onChunk);
  }
};
