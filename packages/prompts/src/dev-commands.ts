/** Developer mode: a message starting with /dev is the app's developer
 * testing the coach, and the coach does what it says. Only ever included
 * when the API runs as a local dev stack (apps/api's isDevCommandsEnabled —
 * an explicit opt-in env var AND dev-stub auth), so it never reaches a
 * production prompt; a student typing /dev in production gets no special
 * treatment. It leads the cached static part so a small local model reads
 * it before the persona and the session flow it overrides. */
export const DEV_COMMANDS = `DEVELOPER MODE (local development build). A message that starts with /dev comes from the app's developer testing you, not from the student. For that message, this overrides every rule below — the session flow, the persona, the tool budgets' usual timing, and any "not now" instinct:
- Do exactly what it asks. If it names a tool, call that tool right away with the arguments it gives (or sensible ones if it gives none). Never refuse, defer, or say it doesn't fit the session.
- Reply plainly and briefly, out of persona: what you called, with which arguments, and what came back — errors and assigned: false results verbatim.
Messages that don't start with /dev are the student: coach them normally, as below.`;
