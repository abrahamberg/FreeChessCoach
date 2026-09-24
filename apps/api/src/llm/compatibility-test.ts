import {
  REMOTE_PROTOCOL_ORDER,
  lowModelOf,
  type LlmModelTestResult,
  type LlmSetup,
  type LlmSetupTestResponse,
  type RemoteLlmProtocol
} from '@freechesscoach/shared';
import type { LlmTunnelTransport } from '../services/engine/llm-tunnel-transport.js';
import { probeRemoteModel, testVoice } from './compatibility-probe.js';
import { testLocalLlmSetup } from './local-compatibility-test.js';

/** OpenAI's gpt-5.4+ reasoning models reject function tools combined with
 * reasoning_effort over /v1/chat/completions outright ("use /v1/responses
 * instead"), so they never fall back to chat completions: a flaky Responses
 * probe must fail the test rather than save a format that breaks every
 * coaching turn. */
export function requiresOpenAiResponsesApi(model: string): boolean {
  const match = /^(?:openai\/)?gpt-(\d+)(?:\.(\d+))?/.exec(model.trim());
  if (!match) return false;
  const major = Number(match[1]);
  const minor = match[2] ? Number(match[2]) : 0;
  return major > 5 || (major === 5 && minor >= 4);
}

/** Tests a setup before it is saved. Remote endpoints: each text model is
 * probed on its own in the order Responses → Anthropic Messages → Chat
 * Completions, and keeps the first format it answers in — so one endpoint
 * (e.g. OpenRouter) can serve a Claude model and a GPT model side by side.
 * Local setups are tested through the user's browser tab. A voice probe is
 * independent and never makes text coaching unavailable. */
export async function testLlmSetup(
  setup: LlmSetup,
  llmTunnelTransport?: LlmTunnelTransport,
  userId?: string
): Promise<LlmSetupTestResponse> {
  if (setup.protocol === 'local') return testLocalLlmSetup(setup, llmTunnelTransport, userId);

  const lowModel = lowModelOf(setup);
  const [low, high] =
    lowModel === setup.highModel
      ? await detectModel(setup, lowModel).then((result) => [result, result] as const)
      : await Promise.all([detectModel(setup, lowModel), detectModel(setup, setup.highModel)]);
  const voice = setup.voiceModel ? await testVoice(setup) : null;
  return { protocol: low.ok && high.ok ? (high.protocol ?? null) : null, low, high, voice };
}

async function detectModel(setup: LlmSetup, model: string): Promise<LlmModelTestResult> {
  const failures: string[] = [];
  for (const protocol of protocolOrderFor(model)) {
    const result = await probeRemoteModel(setup, protocol, model);
    if (result.ok) return result;
    failures.push(`${protocol}: ${result.error ?? 'test failed'}`);
  }
  return { model, ok: false, error: failures.join(' | ') };
}

function protocolOrderFor(model: string): readonly RemoteLlmProtocol[] {
  return requiresOpenAiResponsesApi(model)
    ? REMOTE_PROTOCOL_ORDER.filter((protocol) => protocol !== 'openai-chat')
    : REMOTE_PROTOCOL_ORDER;
}
