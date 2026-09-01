import type { LlmModelTestResult, LlmProtocol, LlmSetup, LlmSetupTestResponse } from '@freechesscoach/shared';

const PROBE_PROMPT = 'Reply with exactly OK.';
const REQUEST_TIMEOUT_MS = 15_000;

/** Tests each configured model with a tiny request. A successful pair selects
 * the wire format used later by the gateway; a voice probe is independent and
 * therefore never makes text coaching unavailable. */
export async function testLlmSetup(setup: LlmSetup): Promise<LlmSetupTestResponse> {
  const candidates: ProtocolTest[] = [];
  for (const protocol of ['openai-chat', 'openai-responses', 'anthropic'] as const) {
    const candidate = await testProtocol(setup, protocol);
    candidates.push(candidate);
    if (candidate.low.ok && candidate.high.ok) break;
  }
  const selected = candidates.find((candidate) => candidate.low.ok && candidate.high.ok);
  if (candidates.length === 0) throw new Error('No LLM compatibility protocols were tested');
  const voice = setup.voiceModel ? await testVoice(setup) : null;

  return {
    protocol: selected?.protocol ?? null,
    low: selected?.low ?? bestModelResult(candidates, 'low', setup.lowModel),
    high: selected?.high ?? bestModelResult(candidates, 'high', setup.highModel),
    voice
  };
}

interface ProtocolTest {
  protocol: LlmProtocol;
  low: LlmModelTestResult;
  high: LlmModelTestResult;
}

function bestModelResult(
  candidates: readonly ProtocolTest[],
  tier: 'low' | 'high',
  model: string
): LlmModelTestResult {
  const passing = candidates.find((candidate) => candidate[tier].ok);
  if (passing) return passing[tier];
  return {
    model,
    ok: false,
    error: candidates
      .map((candidate) => `${candidate.protocol}: ${candidate[tier].error ?? 'test failed'}`)
      .join(' | ')
  };
}

async function testProtocol(setup: LlmSetup, protocol: LlmProtocol): Promise<ProtocolTest> {
  const [low, high] = await Promise.all([
    testTextModel(setup, protocol, setup.lowModel),
    testTextModel(setup, protocol, setup.highModel)
  ]);
  return { protocol, low, high };
}

async function testTextModel(setup: LlmSetup, protocol: LlmProtocol, model: string): Promise<LlmModelTestResult> {
  try {
    const response = await fetchForProtocol(setup, protocol, model);
    if (!response.ok) return { model, ok: false, error: await providerError(response, setup.apiKey) };
    const body: unknown = await response.json();
    if (!hasTextResponse(body, protocol)) {
      return { model, ok: false, error: 'The endpoint returned an invalid text response' };
    }
    return { model, ok: true };
  } catch (error) {
    return { model, ok: false, error: requestError(error) };
  }
}

async function fetchForProtocol(setup: LlmSetup, protocol: LlmProtocol, model: string): Promise<Response> {
  const headers = {
    authorization: `Bearer ${setup.apiKey}`,
    'api-key': setup.apiKey,
    'content-type': 'application/json'
  };
  if (protocol === 'anthropic') {
    return fetchAt(setup.endpoint, '/messages', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${setup.apiKey}`,
        'x-api-key': setup.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: 'user', content: PROBE_PROMPT }] })
    });
  }
  if (protocol === 'openai-responses') {
    return fetchAt(setup.endpoint, '/responses', {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: PROBE_PROMPT, max_output_tokens: 8 })
    });
  }
  return fetchAt(setup.endpoint, '/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages: [{ role: 'user', content: PROBE_PROMPT }], max_tokens: 8 })
  });
}

async function testVoice(setup: LlmSetup): Promise<LlmModelTestResult> {
  const model = setup.voiceModel ?? '';
  try {
    const response = await fetchAt(setup.endpoint, '/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${setup.apiKey}`, 'api-key': setup.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ model, voice: 'alloy', input: 'OK', response_format: 'mp3' })
    });
    if (!response.ok) return { model, ok: false, error: await providerError(response, setup.apiKey) };
    const contentType = response.headers.get('content-type') ?? '';
    return contentType.includes('audio')
      ? { model, ok: true }
      : { model, ok: false, error: 'The endpoint did not return audio data' };
  } catch (error) {
    return { model, ok: false, error: requestError(error) };
  }
}

function fetchAt(endpoint: string, path: string, init: RequestInit): Promise<Response> {
  const endpointUrl = new URL(endpoint);
  endpointUrl.pathname = `${endpointUrl.pathname.replace(/\/$/, '')}/${path.slice(1)}`;
  endpointUrl.hash = '';
  return fetch(endpointUrl, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

function hasTextResponse(body: unknown, protocol: LlmProtocol): boolean {
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
  const body = (await response.text().catch(() => '')).slice(0, 500).replaceAll(apiKey, '[redacted]');
  return body ? `Provider rejected this model (${response.status}): ${body}` : `Provider rejected this model (${response.status})`;
}

function requestError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'The provider timed out during the test';
  return error instanceof Error ? `Could not reach the endpoint: ${error.message}` : 'Could not reach the endpoint';
}
