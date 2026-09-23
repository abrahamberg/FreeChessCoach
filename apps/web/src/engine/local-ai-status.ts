export type LocalAiStatus = 'unknown' | 'reachable' | 'unreachable';

/** Whether the last local-LLM call this tab made for the server (model list,
 * chat, stream) got an answer from LM Studio / Ollama. Module-level for the
 * same reason as tunnel-connection-status.ts: the tunnel client runs at the
 * app root, the status dot in the topbar. */
let status: LocalAiStatus = 'unknown';
const listeners = new Set<(status: LocalAiStatus) => void>();

export function getLocalAiStatus(): LocalAiStatus {
  return status;
}

export function setLocalAiStatus(next: LocalAiStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of listeners) listener(next);
}

/** Notifies on every change and immediately with the current value. */
export function subscribeLocalAiStatus(listener: (status: LocalAiStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}
