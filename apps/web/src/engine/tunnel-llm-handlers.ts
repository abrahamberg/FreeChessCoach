import type { LlmTunnelPayload, LocalModelsResult } from '@freechesscoach/shared';
import { setLocalAiStatus } from './local-ai-status.js';

/** What a handler uses to answer the server; a stream sends many frames. */
export interface TunnelReplies {
  result(result: unknown): void;
  chunk(chunk: string): void;
  done(): void;
}

/** In-flight local streams by requestId, so a server `cancel` can stop one. */
const activeStreams = new Map<string, AbortController>();

export function cancelLlmRequest(requestId: string): void {
  activeStreams.get(requestId)?.abort();
  activeStreams.delete(requestId);
}

/** Answers an `llm` tunnel request by calling the user's local server
 * (LM Studio / Ollama) from this tab. The server can't reach the user's
 * localhost; the tab can, provided the local server allows this site's
 * origin (CORS). */
export async function runLlmRequest(requestId: string, payload: LlmTunnelPayload, replies: TunnelReplies): Promise<void> {
  try {
    if (payload.subKind === 'fetch-models') replies.result(await fetchModels(payload.baseUrl, payload.token));
    else if (payload.subKind === 'chat') replies.result(await chat(payload.baseUrl, payload.token, payload.body));
    else await streamChat(requestId, payload.baseUrl, payload.token, payload.body, replies);
    setLocalAiStatus('reachable');
  } catch (error) {
    setLocalAiStatus('unreachable');
    throw explain(error, payload.baseUrl);
  }
}

function headersFor(token: string | undefined): Record<string, string> {
  return { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
}

async function chat(baseUrl: string, token: string | undefined, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${trimSlash(baseUrl)}/chat/completions`, { method: 'POST', headers: headersFor(token), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local LLM error (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

/** Forwards each SSE `data:` payload as its own frame, as it arrives. */
async function streamChat(
  requestId: string,
  baseUrl: string,
  token: string | undefined,
  body: Record<string, unknown>,
  replies: TunnelReplies
): Promise<void> {
  const controller = new AbortController();
  activeStreams.set(requestId, controller);
  try {
    const response = await fetch(`${trimSlash(baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: headersFor(token),
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Local LLM error (${response.status}): ${(await response.text()).slice(0, 500)}`);
    if (!response.body) throw new Error('Local LLM returned no stream');
    await forEachSseData(response.body, replies.chunk);
    replies.done();
  } finally {
    activeStreams.delete(requestId);
  }
}

async function forEachSseData(body: ReadableStream<Uint8Array>, onData: (data: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice('data:'.length).trim();
      if (data === '[DONE]') return;
      if (data) onData(data);
    }
  }
}

/** The OpenAI-style model list, plus — where the server reports it — which
 * model is loaded and with what context window: LM Studio's REST API
 * (`/api/v0/models`), else Ollama's (`/api/ps`). Both extras are best-effort. */
async function fetchModels(baseUrl: string, token: string | undefined): Promise<LocalModelsResult> {
  const response = await fetch(`${trimSlash(baseUrl)}/models`, { headers: headersFor(token) });
  if (!response.ok) throw new Error(`Failed to list models (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const list = (await response.json()) as { data?: Array<{ id?: unknown }> };
  const models = (list.data ?? []).flatMap((model) => (typeof model.id === 'string' ? [model.id] : []));
  const loaded = (await lmStudioLoaded(baseUrl, token)) ?? (await ollamaLoaded(baseUrl, token));
  return { models, loadedModel: loaded?.model ?? null, contextLength: loaded?.contextLength ?? null };
}

interface LoadedModel {
  model: string;
  contextLength: number | null;
}

async function lmStudioLoaded(baseUrl: string, token: string | undefined): Promise<LoadedModel | null> {
  const body = await tryJson(`${serverRoot(baseUrl)}/api/v0/models`, token);
  const models = (body as { data?: Array<Record<string, unknown>> } | null)?.data ?? [];
  const loaded = models.find((model) => model.state === 'loaded' && typeof model.id === 'string');
  if (!loaded) return null;
  return { model: String(loaded.id), contextLength: positiveNumber(loaded.loaded_context_length) };
}

async function ollamaLoaded(baseUrl: string, token: string | undefined): Promise<LoadedModel | null> {
  const body = await tryJson(`${serverRoot(baseUrl)}/api/ps`, token);
  const first = (body as { models?: Array<Record<string, unknown>> } | null)?.models?.[0];
  if (!first || typeof first.model !== 'string') return null;
  return { model: first.model, contextLength: positiveNumber(first.context_length) };
}

async function tryJson(url: string, token: string | undefined): Promise<unknown> {
  try {
    const response = await fetch(url, { headers: headersFor(token) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** http://localhost:1234/v1 → http://localhost:1234 */
function serverRoot(baseUrl: string): string {
  return trimSlash(baseUrl).replace(/\/v1$/, '');
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && value > 0 ? Math.floor(value) : null;
}

/** A browser reports a blocked cross-origin request, a refused connection
 * and a stopped server all as the same bare TypeError, so name the likely
 * causes instead of guessing one. */
function explain(error: unknown, baseUrl: string): Error {
  if (error instanceof DOMException && error.name === 'AbortError') return new Error('Local LLM request cancelled');
  if (!(error instanceof TypeError)) return error instanceof Error ? error : new Error(String(error));
  const origin = window.location.origin;
  return new Error(
    `This browser couldn't reach ${baseUrl}. Check that the local server is running and allows requests from ${origin}: ` +
      `in LM Studio turn on "Enable CORS" in the Developer tab's server settings; for Ollama set OLLAMA_ORIGINS to include ${origin} and restart it. ` +
      'Your browser may also ask to allow this site to access your local network.'
  );
}
