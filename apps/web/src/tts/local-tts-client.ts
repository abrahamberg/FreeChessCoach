import { PERSONA_VOICES } from './persona-voices.js';
import { localTtsBaseUrl, readLocalTtsPort } from './local-tts-settings.js';
import { splitIntoSentences } from './splitSentences.js';
import type { TtsClient } from './tts-client.js';

/** POSTs one piece of text to a Kokoro-FastAPI server's OpenAI-style
 * `/v1/audio/speech` and returns the MP3 bytes. `voice` is a Kokoro voice id
 * — the same ids persona-voices.ts already maps personas to. */
export async function synthesizeLocal(baseUrl: string, text: string, voice: string): Promise<ArrayBuffer> {
  const response = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'kokoro', input: text, voice, response_format: 'mp3' })
  });
  if (!response.ok) throw new Error(`Local voice server responded with ${response.status}`);
  return response.arrayBuffer();
}

/** Same shape as openai-tts-client.ts (one request per sentence, strictly in
 * order so playback order matches), but the browser calls the user's own
 * machine directly — nothing goes through this app's server, so it also works
 * when the app is hosted. Requests run ahead of playback, so a fast local
 * server stays a sentence or two in front of what's being heard. */
export const localTtsClient: TtsClient = {
  mimeType: 'audio/mpeg',
  async speak(request, onChunk) {
    const baseUrl = localTtsBaseUrl(readLocalTtsPort());
    const voice = PERSONA_VOICES[request.persona];
    const sentences = splitIntoSentences(request.text);
    const toSynthesize = sentences.length > 0 ? sentences : [request.text];
    for (const [index, sentence] of toSynthesize.entries()) {
      onChunk(index, await synthesizeLocal(baseUrl, sentence, voice));
    }
  }
};
