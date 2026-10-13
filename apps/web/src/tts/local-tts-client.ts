import { kokoroSynthesisSpeed } from './persona-voices.js';
import { readLocalTtsUrl } from './local-tts-settings.js';
import { splitIntoSentences } from './splitSentences.js';
import type { TtsClient } from './tts-client.js';

/** The server answered but with an error status. */
export class LocalTtsHttpError extends Error {
  constructor(readonly status: number) {
    super(`Local voice server responded with ${status}`);
  }
}

/** The request never got an answer: the server is off or the address is
 * wrong. fetch reports every such failure as the same bare TypeError. */
export class LocalTtsUnreachableError extends Error {
  constructor(readonly url: string) {
    super(`Cannot reach your voice server at ${url}. Check that it is running and the address is right, or choose 'Kokoro in the browser'.`);
  }
}

/** POSTs one piece of text to a Kokoro-FastAPI server's OpenAI-style
 * `/v1/audio/speech` and returns the audio bytes (MP3 unless asked). `voice`
 * is a Kokoro voice id — the same ids persona-voices.ts already maps
 * personas to. */
export async function synthesizeLocal(baseUrl: string, text: string, voice: string, speed = 1, format: 'mp3' | 'wav' = 'mp3'): Promise<ArrayBuffer> {
  const response = await fetchSpeech(baseUrl, { model: 'kokoro', input: text, voice, speed, response_format: format });
  if (!response.ok) throw new LocalTtsHttpError(response.status);
  return response.arrayBuffer();
}

async function fetchSpeech(baseUrl: string, body: object): Promise<Response> {
  try {
    return await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (error) {
    if (error instanceof TypeError) throw new LocalTtsUnreachableError(baseUrl);
    throw error;
  }
}

/** Same shape as openai-tts-client.ts (one request per sentence, strictly in
 * order so playback order matches), but the browser calls the user's own
 * voice server directly — nothing goes through this app's server, so it also
 * works when the app is hosted. Requests run ahead of playback, so a fast
 * server stays a sentence or two in front of what's being heard. */
export const localTtsClient: TtsClient = {
  mimeType: 'audio/mpeg',
  studioMimeType: 'audio/wav',
  async speak(request, onChunk) {
    const baseUrl = readLocalTtsUrl();
    const { voice, speed } = kokoroSynthesisSpeed(request.persona);
    // A course recording: the whole line in one request, so the voice
    // carries its tone from sentence to sentence instead of starting each
    // one cold, and uncompressed, since it is encoded again into the video.
    // Sentence by sentence in MP3 is for the live coach, where the first
    // words must come fast.
    if (request.studio) {
      onChunk(0, await synthesizeLocal(baseUrl, request.text, voice, speed, 'wav'));
      return;
    }
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
