/** The one definition of "what counts as a move mention" in prose: the chat
 * renderer (web moveMention.ts), speech (web sanToSpokenText.ts) and the
 * course writer's move checks all read text with these. */
export const SAN_MOVE =
  'O-O-O[+#]?|O-O[+#]?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][1-8](?:=[QRBN])?[+#]?';
// A leading move number written as "18.", "18...", or the coach's occasional
// "18-" typo — normalized to standard "18." / "18... " on display either way.
//
// Trailing boundary is `(?!\w)`, not `\b`: a `+`/`#` suffix (check/mate) is
// itself a non-word character, so when it's the last thing consumed and is
// followed by whitespace or end-of-string (the overwhelmingly common case),
// both sides of a `\b` there are non-word — no boundary — and the engine
// backtracks to drop the suffix from the match entirely, leaving a stray
// "+"/"#" as unmatched literal text right after. `(?!\w)` only asserts "not
// immediately followed by a word character", which holds regardless of
// whether the match itself ended on a word or punctuation character.
export const MOVE_TOKEN = new RegExp(`\\b(\\d+)(\\.{1,3}|-)\\s*(${SAN_MOVE})(?!\\w)`, 'g');
export const BARE_SAN = new RegExp(`\\b(${SAN_MOVE})(?!\\w)`, 'g');
