/** OpenAI's TTS surface (POST /v1/audio/speech) isn't a chat/completion
 * call, so it doesn't go through the `ai`/@ai-sdk provider objects the rest
 * of this directory uses — a plain fetch against the REST endpoint is all it
 * needs. Still lives in llm/ per AGENTS.md rule 6 (the only directory
 * allowed to talk to a provider directly). */
export interface SynthesizeSpeechParams {
  apiKey: string;
  modelId: string;
  voice: string;
  text: string;
}

/** Returns MP3 bytes. Throws on any non-2xx response, with the provider's
 * error body folded into the message so a bad voice id or model name is
 * diagnosable from the thrown error alone. */
export async function synthesizeSpeech({ apiKey, modelId, voice, text }: SynthesizeSpeechParams): Promise<Buffer> {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      voice,
      input: text,
      response_format: 'mp3'
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI TTS request failed with ${response.status}: ${body}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
