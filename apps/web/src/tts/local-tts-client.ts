import { kokoroSynthesisSpeed } from './persona-voices.js';
import { readLocalTtsUrl } from './local-tts-settings.js';
import { splitIntoSentences } from './splitSentences.js';
import type { TtsClient } from './tts-client.js';

/** The server answered but with an error status. A request that never got an
 * answer — server off, wrong address, or blocked by CORS — is a plain
 * TypeError from fetch instead, which is how the Test button tells them apart. */
export class LocalTtsHttpError extends Error {
  constructor(readonly status: number) {
    super(`Local voice server responded with ${status}`);
  }
}

/** POSTs one piece of text to a Kokoro-FastAPI server's OpenAI-style
 * `/v1/audio/speech` and returns the MP3 bytes. `voice` is a Kokoro voice id
 * — the same ids persona-voices.ts already maps personas to. */
export async function synthesizeLocal(baseUrl: string, text: string, voice: string, speed = 1): Promise<ArrayBuffer> {
  const response = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'kokoro', input: text, voice, speed, response_format: 'mp3' })
  });
  if (!response.ok) throw new LocalTtsHttpError(response.status);
  return response.arrayBuffer();
}

/** Same shape as openai-tts-client.ts (one request per sentence, strictly in
 * order so playback order matches), but the browser calls the user's own
 * voice server directly — nothing goes through this app's server, so it also
 * works when the app is hosted. Requests run ahead of playback, so a fast
 * server stays a sentence or two in front of what's being heard. */
export const localTtsClient: TtsClient = {
  mimeType: 'audio/mpeg',
  async speak(request, onChunk) {
    const baseUrl = readLocalTtsUrl();
    const { voice, speed } = kokoroSynthesisSpeed(request.persona);
    const sentences = splitIntoSentences(request.text);
    const toSynthesize = sentences.length > 0 ? sentences : [request.text];
    for (const [index, sentence] of toSynthesize.entries()) {
      onChunk(index, await synthesizeLocal(baseUrl, sentence, voice, speed));
    }
  },
  // Kokoro-FastAPI's first request after it has been idle is several times
  // slower than the next (measured on the CPU image: 12.6s vs 5.7s).
  warmUp(persona) {
    const { voice, speed } = kokoroSynthesisSpeed(persona);
    synthesizeLocal(readLocalTtsUrl(), 'Ok.', voice, speed).catch(() => {});
  }
};
