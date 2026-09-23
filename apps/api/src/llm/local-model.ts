import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult
} from '@ai-sdk/provider';
import type { LlmTunnelPayload } from '@freechesscoach/shared';
import type { LlmCallPriority } from '../services/engine/llm-call-queue.js';
import type { LlmTunnelTransport } from '../services/engine/llm-tunnel-transport.js';
import { buildLocalChatBody } from './local-request.js';
import { parseLocalCompletion } from './local-response.js';
import { LocalStreamMapper } from './local-stream.js';
import { thinkingBudgetChars } from './local-thinking-budget.js';
import type { LocalLlmTimeouts } from './model-options.js';

export interface LocalModelOptions {
  transport: LlmTunnelTransport;
  timeouts: LocalLlmTimeouts;
  userId: string;
  modelId: string;
  /** The local server's OpenAI-compatible base URL, e.g. http://localhost:1234/v1. */
  baseUrl: string;
  token?: string;
  /** Queue priority of whole-answer calls: background by default (session
   * summaries); the setup test is interactive. Streams are always interactive. */
  generatePriority?: LlmCallPriority;
}

/** (User, server, model) combinations that rejected `reasoning_effort` or
 * `chat_template_kwargs`. They get requests without them from then on, for
 * the life of the process. Keyed per user, not just by base URL + model:
 * different users' local servers commonly share the same default URL (e.g.
 * localhost:1234) and model name despite running on different machines with
 * different capabilities. */
const serversWithoutThinkingControls = new Set<string>();

const THINKING_CONTROL_ERROR = /reasoning_effort|chat_template_kwargs/i;

/**
 * An AI SDK model for a local LLM (LM Studio / Ollama) that the server
 * reaches through the user's browser tab: Server → WebSocket → tab → local
 * server and back. `doStream` streams for real (the coach), `doGenerate`
 * waits for the whole answer (structured output, background jobs). Calls
 * for one user run one at a time (LlmCallQueue); streams go ahead of
 * whole-answer calls.
 */
export function createLocalModel(options: LocalModelOptions): LanguageModelV4 {
  const serverKey = `${options.userId}|${options.baseUrl}|${options.modelId}`;
  const bodyFor = (callOptions: LanguageModelV4CallOptions, stream: boolean, forceThinkingOff = false): Record<string, unknown> =>
    buildLocalChatBody(options.modelId, callOptions, {
      stream,
      sendThinkingControls: !serversWithoutThinkingControls.has(serverKey),
      forceThinkingOff
    });
  const payloadFor = (body: Record<string, unknown>, stream: boolean): LlmTunnelPayload => ({
    kind: 'llm',
    subKind: stream ? 'chat-stream' : 'chat',
    baseUrl: options.baseUrl,
    token: options.token,
    body
  });

  async function generate(callOptions: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
    const send = (body: Record<string, unknown>): Promise<unknown> =>
      options.transport.request(options.userId, payloadFor(body, false), {
        timeoutMs: options.timeouts.requestTimeoutMs,
        priority: options.generatePriority ?? 'background',
        signal: callOptions.abortSignal
      });
    let body = bodyFor(callOptions, false);
    let raw: unknown;
    try {
      raw = await send(body);
    } catch (error) {
      if (!hasThinkingControls(body) || !isThinkingControlRejection(error)) throw error;
      serversWithoutThinkingControls.add(serverKey);
      body = bodyFor(callOptions, false);
      raw = await send(body);
    }
    const parsed = parseLocalCompletion(raw, callOptions.responseFormat?.type === 'json');
    return { ...parsed, request: { body }, warnings: [] };
  }

  async function stream(callOptions: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
    const abort = new AbortController();
    const signal = callOptions.abortSignal ? AbortSignal.any([callOptions.abortSignal, abort.signal]) : abort.signal;
    const openChunks = (thinkingOff: boolean, attemptSignal: AbortSignal): AsyncIterable<string> =>
      options.transport.stream(options.userId, payloadFor(bodyFor(callOptions, true, thinkingOff), true), {
        timeoutMs: options.timeouts.streamIdleMs,
        priority: 'interactive',
        signal: AbortSignal.any([signal, attemptSignal])
      });
    const budgetChars = thinkingBudgetChars(callOptions.reasoning);
    return {
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          void pump(controller, openChunks, serverKey, budgetChars);
        },
        cancel() {
          abort.abort();
        }
      }),
      request: { body: bodyFor(callOptions, true) }
    };
  }

  return {
    specificationVersion: 'v4',
    provider: 'local',
    modelId: options.modelId,
    supportedUrls: {},
    doGenerate: generate,
    doStream: stream
  };
}

type OpenChunks = (thinkingOff: boolean, signal: AbortSignal) => AsyncIterable<string>;

async function pump(
  controller: ReadableStreamDefaultController<LanguageModelV4StreamPart>,
  openChunks: OpenChunks,
  serverKey: string,
  budgetChars: number | undefined
): Promise<void> {
  // Once the consumer cancels, enqueue/close throw; there is no one left to tell.
  const emit = (part: LanguageModelV4StreamPart): void => {
    try {
      controller.enqueue(part);
    } catch {
      // cancelled
    }
  };
  emit({ type: 'stream-start', warnings: [] });
  try {
    const overran = await pumpAttempt(emit, openChunks, serverKey, new LocalStreamMapper(), false, budgetChars);
    // The model thought past its budget: ask again with thinking off.
    if (overran) await pumpAttempt(emit, openChunks, serverKey, new LocalStreamMapper('reasoning-1'), true, undefined);
  } catch (error) {
    emit({ type: 'error', error });
  }
  try {
    controller.close();
  } catch {
    // cancelled
  }
}

/** Runs one request to the end. Returns true when it was cut short because
 * its thinking passed `budgetChars` before any answer or tool call began. */
async function pumpAttempt(
  emit: (part: LanguageModelV4StreamPart) => void,
  openChunks: OpenChunks,
  serverKey: string,
  mapper: LocalStreamMapper,
  thinkingOff: boolean,
  budgetChars: number | undefined
): Promise<boolean> {
  const attempt = new AbortController();
  let emitted = false;
  let thinkingChars = 0;
  let answering = false;
  const open = (): AsyncIterable<string> => openChunks(thinkingOff, attempt.signal);
  for await (const chunk of readWithRetry(open, serverKey, () => emitted)) {
    for (const part of mapper.push(chunk)) {
      emitted = true;
      emit(part);
      if (part.type === 'reasoning-delta') thinkingChars += part.delta.length;
      else if (part.type === 'text-start' || part.type === 'tool-input-start') answering = true;
    }
    if (budgetChars !== undefined && !answering && thinkingChars > budgetChars) {
      attempt.abort();
      mapper.abandonThinking().forEach(emit);
      return true;
    }
  }
  mapper.finish().forEach(emit);
  return false;
}

/** Streams chunks; if the server rejects the thinking fields before any
 * output, retries once without them. */
async function* readWithRetry(
  open: () => AsyncIterable<string>,
  serverKey: string,
  hasEmitted: () => boolean
): AsyncGenerator<string> {
  try {
    yield* open();
  } catch (error) {
    if (hasEmitted() || serversWithoutThinkingControls.has(serverKey) || !isThinkingControlRejection(error)) throw error;
    serversWithoutThinkingControls.add(serverKey);
    yield* open();
  }
}

function hasThinkingControls(body: Record<string, unknown>): boolean {
  return 'reasoning_effort' in body || 'chat_template_kwargs' in body;
}

function isThinkingControlRejection(error: unknown): boolean {
  return error instanceof Error && THINKING_CONTROL_ERROR.test(error.message);
}
