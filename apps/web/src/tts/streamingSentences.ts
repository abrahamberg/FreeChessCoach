// A sentence ends at `.`/`!`/`?` (plus any closing quote, bracket or bold
// marker) followed by whitespace and more text. Runs on the coach's *raw*
// markdown, before sanToSpokenText.ts: the dots after a bare move number
// ("24. a4", "Play (12. Nf3)", "26... c6") are left alone so one is never
// mistaken for a sentence end mid-stream. Only a *bare* number counts — a
// square ("…the knight on f3. Black's plan…") still ends its sentence, or a
// reply whose sentences end on squares would wait for the whole turn.
const RAW_SENTENCE_END = /(?:[!?]|(?<!(?:^|[\s(])\d+\.*)\.)[.!?]*["')\]*]*(?=\s+\S)/g;

/**
 * The sentences of a coach reply that has only partly streamed in, so voice
 * can start on the first one instead of waiting for the whole turn. Only
 * sentences known to be complete are returned: one is complete once the
 * text after it has started (the next sentence's first character), or once
 * `isFinal` says nothing more is coming, in which case the trailing
 * remainder counts too. Earlier sentences never change as more text
 * arrives, so a caller can speak `result.slice(alreadySpoken)` each time.
 */
export function completedSentences(text: string, isFinal: boolean): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (const match of text.matchAll(RAW_SENTENCE_END)) {
    const end = match.index + match[0].length;
    pushTrimmed(sentences, text.slice(start, end));
    start = end;
  }
  if (isFinal) pushTrimmed(sentences, text.slice(start));
  return sentences;
}

function pushTrimmed(sentences: string[], sentence: string): void {
  const trimmed = sentence.trim();
  if (trimmed) sentences.push(trimmed);
}
