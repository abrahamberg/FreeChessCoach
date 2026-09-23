/**
 * Coach context restructure design §3, final review #4: the per-episode
 * auto-fold summarizer prompt — distinct from session-context.ts's
 * COMPACTOR_SYSTEM_PROMPT, which is built for a 300-TOKEN whole-session
 * digest (plus an appended OPEN THREADS block). This one produces a single
 * sentence for `session_move_notes.note`, the same slot a coach-authored
 * record_move_note call would fill (capped at 300 CHARACTERS — see
 * recordMoveNoteParameters in tools.ts), so the two paths need to produce
 * comparably-sized artifacts.
 */
export const EPISODE_FOLD_SYSTEM_PROMPT =
  "You compress one chess-coaching move's worth of conversation into one or two sentences (under 50 words) for the coach's own memory. Lead with what the STUDENT said or answered (their reasoning, or that they have not answered yet), then what the coach concluded or assigned, then any question still open. Be concrete: name moves and ideas, never write generic phrases like 'the coach reviewed'. Output only those sentences.";

/**
 * The long-form counterpart to EPISODE_FOLD_SYSTEM_PROMPT: written once per
 * closed episode and shown to the coach in "## Other moves discussed" until
 * the NEXT episode closes and replaces it. It stands in for the raw
 * conversation, so it has to keep what would otherwise be re-litigated:
 * hypothetical lines that were explored and what they showed.
 */
export function episodeDetailSystemPrompt(maxWords: number): string {
  return `You write the coach's memory of the chess-coaching conversation about ONE move, which has just ended. A later reader will rely on it instead of the transcript, so be detailed but stay within about ${maxWords} words (plain prose or short bullets). Cover, concretely and with move notation: what the student said and their reasoning; every alternative or hypothetical line explored and what it showed (who was better, why); what the coach explained or concluded; anything the student was asked or assigned; and the last thing said and any question still open, so the next conversation can continue rather than restart. Do not greet, do not describe the process ('the coach reviewed'), and never invent moves that were not in the conversation. Output only the summary.`;
}
