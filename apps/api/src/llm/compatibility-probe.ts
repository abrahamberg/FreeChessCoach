import type { LlmModelTestResult, LlmSetup, RemoteLlmProtocol } from '@freechesscoach/shared';
import { BlockedEndpointError, endpointFetch } from './endpoint-fetch.js';

export const PROBE_PROMPT = 'Reply with exactly OK.';
const REQUEST_TIMEOUT_MS = 15_000;
/** A flex probe can queue behind standard traffic, so it gets far longer. */
const FLEX_REQUEST_TIMEOUT_MS = 60_000;

/** Every coaching turn sends tools, and some endpoints accept a plain prompt
 * in a format whose tool calling they reject. So the probe carries one
 * trivial function tool: passing it proves the format works for real turns. */
const PROBE_TOOL = {
  name: 'probe_tool',
  description: 'Not needed for this request.',
  parameters: { type: 'object', properties: {}, additionalProperties: false }
} as const;

/** Sends one tiny tool-bearing request to `model` in `protocol`'s wire
 * format. Passes on a 2xx with a well-formed body for that format. */
export async function probeRemoteModel(
  setup: LlmSetup,
  protocol: RemoteLlmProtocol,
  model: string
): Promise<LlmModelTestResult> {
  const apiKey = setup.apiKey ?? '';
  try {
    const response = await fetchForProtocol(setup, protocol, model);
    if (!response.ok) return { model, ok: false, error: await providerError(response, apiKey) };
    const body: unknown = await response.json();
    if (!hasValidResponse(body, protocol)) {
      return { model, ok: false, error: 'The endpoint answered, but not in this format' };
    }
    return { model, ok: true, protocol };
  } catch (error) {
    return { model, ok: false, error: requestError(error) };
  }
}

function fetchForProtocol(setup: LlmSetup, protocol: RemoteLlmProtocol, model: string): Promise<Response> {
  const apiKey = setup.apiKey ?? '';
  if (protocol === 'anthropic') {
    return fetchAt(setup.endpoint, '/messages', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: PROBE_PROMPT }],
        tools: [{ name: PROBE_TOOL.name, description: PROBE_TOOL.description, input_schema: PROBE_TOOL.parameters }]
      })
    });
  }
  const headers = { authorization: `Bearer ${apiKey}`, 'api-key': apiKey, 'content-type': 'application/json' };
  // Probing on the flex tier proves the chosen model actually supports it —
  // OpenAI rejects service_tier=flex for models that don't — so a bad pairing
  // fails the test instead of every later coaching turn.
  const flex = setup.useFlex ? { service_tier: 'flex' } : {};
  const timeoutMs = setup.useFlex ? FLEX_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  if (protocol === 'openai-responses') {
    return fetchAt(setup.endpoint, '/responses', {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: PROBE_PROMPT, tools: [{ type: 'function', ...PROBE_TOOL }], ...flex })
    }, timeoutMs);
  }
  return fetchAt(setup.endpoint, '/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: PROBE_PROMPT }],
      tools: [{ type: 'function', function: PROBE_TOOL }],
      ...flex
    })
  }, timeoutMs);
}

export async function testVoice(setup: LlmSetup): Promise<LlmModelTestResult> {
  const model = setup.voiceModel ?? '';
  const apiKey = setup.apiKey ?? '';
  try {
    const response = await fetchAt(setup.endpoint, '/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ model, voice: 'alloy', input: 'OK', response_format: 'mp3' })
    });
    if (!response.ok) return { model, ok: false, error: await providerError(response, apiKey) };
    const contentType = response.headers.get('content-type') ?? '';
    return contentType.includes('audio')
      ? { model, ok: true }
      : { model, ok: false, error: 'The endpoint did not return audio data' };
  } catch (error) {
    return { model, ok: false, error: requestError(error) };
  }
}

function fetchAt(endpoint: string, path: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const endpointUrl = new URL(endpoint);
  endpointUrl.pathname = `${endpointUrl.pathname.replace(/\/$/, '')}/${path.slice(1)}`;
  endpointUrl.hash = '';
  return endpointFetch()(endpointUrl, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

function hasValidResponse(body: unknown, protocol: RemoteLlmProtocol): boolean {
  if (typeof body !== 'object' || body === null) return false;
  if (protocol === 'anthropic') {
    const content = (body as { content?: unknown }).content;
    return Array.isArray(content) && content.length > 0;
  }
  if (protocol === 'openai-responses') return Array.isArray((body as { output?: unknown }).output);
  const choices = (body as { choices?: unknown }).choices;
  return Array.isArray(choices) && choices.length > 0;
}

async function providerError(response: Response, apiKey: string): Promise<string> {
  const text = await response.text().catch(() => '');
  const body = apiKey ? text.replaceAll(apiKey, '[redacted]') : text;
  const message = extractErrorMessage(body) ?? body.slice(0, 200);
  return message ? `Provider rejected this model (${response.status}): ${message}` : `Provider rejected this model (${response.status})`;
}

/** Providers wrap their error text differently ({ error: { message } } for
 * OpenAI, { error: { type, message } } for Anthropic) — pull just the
 * human-readable message out so the UI never has to show a raw JSON body. */
function extractErrorMessage(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const error = (parsed as { error?: unknown }).error;
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
    return null;
  } catch {
    return null;
  }
}

function requestError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'The provider timed out during the test';
  const blocked = blockedEndpointOf(error);
  if (blocked) return `Could not reach the endpoint: ${blocked.message}`;
  return error instanceof Error ? `Could not reach the endpoint: ${error.message}` : 'Could not reach the endpoint';
}

/** undici reports a refused connection as `TypeError('fetch failed')` with
 * the real reason as its `cause`. */
function blockedEndpointOf(error: unknown): BlockedEndpointError | null {
  if (error instanceof BlockedEndpointError) return error;
  const cause = error instanceof Error ? error.cause : undefined;
  return cause instanceof BlockedEndpointError ? cause : null;
}
