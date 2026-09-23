import {
  LocalModelsResultSchema,
  type LlmModelTestResult,
  type LlmSetup,
  type LlmSetupTestResponse,
  type LocalModelsResult
} from '@freechesscoach/shared';
import type { LlmTunnelTransport } from '../services/engine/llm-tunnel-transport.js';
import { PROBE_PROMPT } from './compatibility-probe.js';
import { createLocalModel } from './local-model.js';
import { DEFAULT_LOCAL_LLM_TIMEOUTS } from './model-options.js';

const MODELS_TIMEOUT_MS = 30_000;
/** Room for a model that thinks a little despite being asked not to. */
const PROBE_MAX_TOKENS = 512;
/** The coach's system prompt plus its tool definitions are about 15k tokens
 * (docs/prompts.md §1 is ~40 KB, packages/prompts/src/tools.ts ~22 KB, at
 * ~4 chars/token), before any conversation. */
export const LOCAL_MIN_CONTEXT_TOKENS = 16_384;
const LOCAL_RECOMMENDED_CONTEXT_TOKENS = 32_768;

/** Asks the user's tab to list the local server's models (and, where the
 * server says, which one is loaded and with what context window). */
export async function fetchLocalModels(
  transport: LlmTunnelTransport,
  userId: string,
  baseUrl: string,
  token?: string
): Promise<LocalModelsResult> {
  const raw = await transport.request(
    userId,
    { kind: 'llm', subKind: 'fetch-models', baseUrl, token },
    { timeoutMs: MODELS_TIMEOUT_MS, priority: 'interactive' }
  );
  return LocalModelsResultSchema.parse(raw);
}

/** Tests a local setup through the user's browser tab: the model list first
 * (proves the tab can reach the server at all), then one real request per
 * distinct model, one after another — a local server answers one at a time.
 * Thinking is off for the probe and the answer must contain text or a tool
 * call, so a model that only thinks fails here instead of on the first
 * coaching turn. */
export async function testLocalLlmSetup(
  setup: LlmSetup,
  transport: LlmTunnelTransport | undefined,
  userId: string | undefined
): Promise<LlmSetupTestResponse> {
  if (!transport || !userId) return bothFailed(setup, 'Local AI is not available on this server.');

  let models: LocalModelsResult;
  try {
    models = await fetchLocalModels(transport, userId, setup.endpoint, setup.localToken);
  } catch (error) {
    return bothFailed(setup, `This browser could not reach ${setup.endpoint}: ${messageOf(error)}`);
  }

  const high = await probeLocalModel(setup, transport, userId, setup.highModel);
  const low = setup.lowModel === setup.highModel ? high : await probeLocalModel(setup, transport, userId, setup.lowModel);
  const warning = contextWarning(models, setup.highModel);
  const highWithWarning = warning && high.ok ? { ...high, warning } : high;
  return {
    protocol: low.ok && high.ok ? 'local' : null,
    low: setup.lowModel === setup.highModel ? highWithWarning : low,
    high: highWithWarning,
    voice: null
  };
}

async function probeLocalModel(
  setup: LlmSetup,
  transport: LlmTunnelTransport,
  userId: string,
  model: string
): Promise<LlmModelTestResult> {
  const localModel = createLocalModel({
    transport,
    timeouts: DEFAULT_LOCAL_LLM_TIMEOUTS,
    userId,
    modelId: model,
    baseUrl: setup.endpoint,
    token: setup.localToken,
    generatePriority: 'interactive'
  });
  try {
    await localModel.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: PROBE_PROMPT }] }],
      maxOutputTokens: PROBE_MAX_TOKENS,
      reasoning: 'none'
    });
    return { model, ok: true, protocol: 'local' };
  } catch (error) {
    return { model, ok: false, error: messageOf(error) };
  }
}

/** Only judged when the server reports the context of the model we'll use. */
function contextWarning(models: LocalModelsResult, model: string): string | undefined {
  if (models.contextLength === null || models.loadedModel !== model) return undefined;
  if (models.contextLength >= LOCAL_MIN_CONTEXT_TOKENS) return undefined;
  return (
    `${model} is loaded with a ${models.contextLength}-token context, but the coach needs about ` +
    `${LOCAL_MIN_CONTEXT_TOKENS} (${LOCAL_RECOMMENDED_CONTEXT_TOKENS} recommended). ` +
    'Reload it with a larger context length in LM Studio or Ollama, or coaching replies will fail.'
  );
}

function bothFailed(setup: LlmSetup, error: string): LlmSetupTestResponse {
  return {
    protocol: null,
    low: { model: setup.lowModel, ok: false, error },
    high: { model: setup.highModel, ok: false, error },
    voice: null
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
