import { CLOUD_PROVIDER_PRESETS, type CloudModelsResponse, type KnownCloudProvider } from '@freechesscoach/shared';
import { endpointFetch } from './endpoint-fetch.js';

const REQUEST_TIMEOUT_MS = 15_000;

/** Ids in OpenAI's list that can't be the coach: embeddings, speech, images,
 * moderation, realtime/audio-only and legacy completion models. */
const NON_TEXT_MODEL = /embedding|tts|whisper|transcribe|dall-e|image|moderation|realtime|audio|search|sora|davinci|babbage/;

/** Lists `provider`'s models with the user's key, which doubles as the key
 * check: a rejected key comes back as `error` with no models. The URL comes
 * from the preset, never from the request. */
export async function fetchCloudModels(provider: KnownCloudProvider, apiKey: string): Promise<CloudModelsResponse> {
  const endpoint = CLOUD_PROVIDER_PRESETS[provider].endpoint;
  if (provider === 'openrouter') {
    // OpenRouter's model list is public, so it can't vouch for the key.
    const keyCheck = await get(`${endpoint}/key`, bearer(apiKey));
    if (!keyCheck.ok) return failure(keyCheck.status);
  }
  const headers = provider === 'anthropic' ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } : bearer(apiKey);
  const query = provider === 'anthropic' ? '?limit=1000' : '';
  const response = await get(`${endpoint}/models${query}`, headers);
  if (!response.ok) return failure(response.status);
  const ids = modelIds(await response.json());
  if (provider !== 'openai') return { models: ids, voiceModels: [] };
  return { models: ids.filter((id) => !NON_TEXT_MODEL.test(id)), voiceModels: ids.filter((id) => id.includes('tts')) };
}

/** Pulls `data[].id` out of an OpenAI/Anthropic/OpenRouter model list. */
export function modelIds(body: unknown): string[] {
  const data = typeof body === 'object' && body !== null && 'data' in body ? body.data : null;
  if (!Array.isArray(data)) return [];
  const ids = data
    .map((entry: unknown) => (typeof entry === 'object' && entry !== null && 'id' in entry ? entry.id : null))
    .filter((id): id is string => typeof id === 'string' && id !== '');
  return [...new Set(ids)].sort(compareModels);
}

/** GPT models first, newest version first (gpt-6 before gpt-5.4 before
 * gpt-5), with OpenRouter's `openai/` prefix ignored; everything else after,
 * alphabetically. Same version: alphabetical (gpt-6-luna, gpt-6-sol). */
export function compareModels(a: string, b: string): number {
  const va = gptVersion(a);
  const vb = gptVersion(b);
  if (va && vb) return vb.major - va.major || vb.minor - va.minor || a.localeCompare(b);
  if (va) return -1;
  if (vb) return 1;
  return a.localeCompare(b);
}

function gptVersion(id: string): { major: number; minor: number } | null {
  const match = /^(?:openai\/)?gpt-(\d+)(?:\.(\d+))?/.exec(id);
  return match ? { major: Number(match[1]), minor: match[2] ? Number(match[2]) : 0 } : null;
}

async function get(url: string, headers: Record<string, string>): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  try {
    return await endpointFetch()(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    return { ok: false, status: 0, json: async () => null };
  }
}

function bearer(apiKey: string): Record<string, string> {
  return { authorization: `Bearer ${apiKey}` };
}

function failure(status: number): CloudModelsResponse {
  return { models: [], voiceModels: [], error: describeStatus(status) };
}

function describeStatus(status: number): string {
  if (status === 401 || status === 403) return 'That API key was rejected.';
  if (status === 429) return 'The provider is rate-limiting this key; try again in a minute.';
  if (status === 0) return 'Could not reach the provider.';
  return `The provider answered with an error (${status}).`;
}
