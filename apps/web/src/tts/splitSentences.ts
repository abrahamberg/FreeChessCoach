// Split after a `.`/`!`/`?` followed by whitespace and more text. Safe to
// run on text that has already gone through sanToSpokenText.ts (no bare
// move-number periods like "24." left to misread as sentence ends).
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=\S)/;

/** Splits speakable text into sentence-sized chunks for the OpenAI TTS
 * backend (openai-tts-client.ts) to synthesize and stream one at a time,
 * instead of waiting for the whole message to generate before any audio is
 * available — the same "audio starts on the first chunk" experience
 * kokoro-worker.ts already gets for free from kokoro-js's own sentence
 * streaming. Not a full NLP sentence tokenizer — abbreviations like "Mr."
 * or "e.g." would split early — but coach prose doesn't use those, and a
 * slightly-too-eager split just means one extra short TTS request, not
 * wrong audio. */
export function splitIntoSentences(text: string): string[] {
  return text
    .split(SENTENCE_BOUNDARY)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}
