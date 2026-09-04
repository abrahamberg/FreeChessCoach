/**
 * Shared structured dev logging: one pretty-printed JSON object per event,
 * gated by the DEBUG_LOG env var so normal server logs stay quiet by
 * default. DEBUG_LOG is a comma-separated allowlist of event types (e.g.
 * DEBUG_LOG=bot_move) — set it to "*" to see every event type. Any
 * subsystem can call `devLog('its_own_type', {...})` without inventing its
 * own env var or console.log convention; use `isDevLogEnabled` first to
 * skip building an event's payload entirely when nothing's listening for
 * it (see bot-move-selector.ts for an example — deriving its debug fields
 * costs real work that shouldn't run on every move when logging is off).
 */
const enabledTypes = new Set(
  (process.env.DEBUG_LOG ?? '')
    .split(',')
    .map((type) => type.trim())
    .filter(Boolean)
);

export function isDevLogEnabled(type: string): boolean {
  return enabledTypes.has('*') || enabledTypes.has(type);
}

export function devLog<T extends object>(type: string, entry: T): void {
  if (!isDevLogEnabled(type)) return;
  console.log(JSON.stringify({ type, ...entry }, null, 2));
}
