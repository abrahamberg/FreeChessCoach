import { kokoroSynthesisSpeed } from './persona-voices.js';
import { getSharedTtsWorker } from './shared-tts-worker-instance.js';
import type { TtsClient } from './tts-client.js';

/** Adapts SharedTtsWorker (persona -> Kokoro voice and speed, sentence-by-sentence
 * WAV chunks) to the common TtsClient shape. */
export const kokoroTtsClient: TtsClient = {
  mimeType: 'audio/wav',
  speak(request, onChunk) {
    return getSharedTtsWorker().speak({ text: request.text, ...kokoroSynthesisSpeed(request.persona) }, onChunk);
  },
  // The model loads on the first speak() (~1s even from the browser cache),
  // and the first inference after that pays a one-time warm-up too.
  warmUp(persona) {
    getSharedTtsWorker()
      .speak({ text: 'Ok.', ...kokoroSynthesisSpeed(persona) }, () => {})
      .catch(() => {});
  }
};
