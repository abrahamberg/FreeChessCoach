// A sentence ends at `.`/`!`/`?` (plus any closing quote, bracket or bold
// marker) followed by whitespace and more text. Runs on the coach's *raw*
// markdown, before sanToSpokenText.ts: the dots after a bare move number
// ("24. a4", "Play (12. Nf3)", "26... c6") are left alone so one is never
// mistaken for a sentence end mid-stream. Only a *bare* number counts — a
// square ("…the knight on f3. Black's plan…") still ends its sentence, or a
// reply whose sentences end on squares would wait for the whole turn.
const RAW_SENTENCE_END = /(?:[!?]|(?<!(?:^|[\s(])\d+\.*)\.)[.!?]*["')\]*]*(?=\s+\S)/g;

// A clause break inside a sentence: `,`/`;`/`:` followed by whitespace (so
// "1,500" never splits), or a dash. Only used to cut the reply's first
// sentence short — see completedSentences.
const RAW_CLAUSE_END = /(?:[,;:]["')\]*]*(?=\s+\S)|[—–](?=\s*\S))/g;

// A shorter first piece would be a lone "So," or "Yes," — a fragment voiced
// on its own, for barely any head start.
const MIN_FIRST_CLAUSE_CHARS = 12;

/**
 * The pieces of a coach reply that has only partly streamed in, so voice can
 * start on the first one instead of waiting for the whole turn. Only pieces
 * known to be complete are returned: a sentence is complete once the text
 * after it has started (the next sentence's first character), or once
 * `isFinal` says nothing more is coming, in which case the trailing
 * remainder counts too. Earlier pieces never change as more text arrives,
 * so a caller can speak `result.slice(alreadySpoken)` each time.
 *
 * The reply's first sentence is cut at its first clause break, so the very
 * first piece is short: every voice backend takes roughly as long to
 * synthesize a piece as the piece is long (in-browser Kokoro ~12s for a
 * 90-character sentence vs ~6s for its first clause), and nothing is heard
 * until that first piece is ready. Later sentences stay whole — by then
 * playback is under way and synthesis runs ahead of it.
 */
export function completedSentences(text: string, isFinal: boolean): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (const match of text.matchAll(RAW_SENTENCE_END)) {
    const end = match.index + match[0].length;
    if (start === 0) start = pushFirstClause(sentences, text.slice(0, end));
    pushTrimmed(sentences, text.slice(start, end));
    start = end;
  }
  // Still inside the first sentence: its opening clause may already be done.
  if (start === 0) start = pushFirstClause(sentences, text);
  if (isFinal) pushTrimmed(sentences, text.slice(start));
  return sentences;
}

/** Pushes the first sentence's opening clause, if it has a clause break past
 * MIN_FIRST_CLAUSE_CHARS that isn't inside a **bold** span, and returns where
 * the rest of the sentence starts (0 when there's no such break). */
function pushFirstClause(sentences: string[], sentence: string): number {
  for (const match of sentence.matchAll(RAW_CLAUSE_END)) {
    const end = match.index + match[0].length;
    if (end < MIN_FIRST_CLAUSE_CHARS) continue;
    if ((sentence.slice(0, end).match(/\*\*/g)?.length ?? 0) % 2 !== 0) continue;
    pushTrimmed(sentences, sentence.slice(0, end));
    return end;
  }
  return 0;
}

function pushTrimmed(sentences: string[], sentence: string): void {
  const trimmed = sentence.trim();
  if (trimmed) sentences.push(trimmed);
}
