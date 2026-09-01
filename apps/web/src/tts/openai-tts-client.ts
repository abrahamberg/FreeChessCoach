import { splitIntoSentences } from './splitSentences.js';
import type { TtsClient } from './tts-client.js';

async function synthesizeSentence(text: string, persona: string): Promise<ArrayBuffer> {
  const response = await fetch('/api/tts/speak', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, persona })
  });
  if (!response.ok) {
    throw new Error(`OpenAI TTS request failed with ${response.status}`);
  }
  return response.arrayBuffer();
}

/** Calls the backend's OpenAI-TTS route (POST /api/tts/speak — server-side
 *  gated on users.tts_enabled/tts_backend, bills the user's own OpenAI key
 *  there) once per
 * sentence rather than once for the whole message: gpt-4o-mini-tts can
 * stream, but each request through this backend still waits for its own
 * full response — splitting the message means the *first* request is short
 * and comes back fast, so playback starts well before a long, multi-
 * sentence reply would otherwise finish generating (the same "audio on the
 * first chunk" experience kokoro-worker.ts gets from kokoro-js's own
 * sentence streaming). Sentences are requested strictly in order — never in
 * parallel — because useCoachVoice's chunk queue plays whatever `onChunk`
 * delivers next, so an out-of-order chunk would play the message out of
 * order. A later sentence failing to synthesize stops the message there;
 * everything already delivered via onChunk stays cached and playable. */
export const openaiTtsClient: TtsClient = {
  mimeType: 'audio/mpeg',
  async speak(request, onChunk) {
    const sentences = splitIntoSentences(request.text);
    const toSynthesize = sentences.length > 0 ? sentences : [request.text];
    for (const [index, sentence] of toSynthesize.entries()) {
      const audio = await synthesizeSentence(sentence, request.persona);
      onChunk(index, audio);
    }
  }
};
