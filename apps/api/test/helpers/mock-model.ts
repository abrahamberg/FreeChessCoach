import type { LanguageModelV4Content, LanguageModelV4GenerateResult, LanguageModelV4StreamPart, LanguageModelV4Usage } from '@ai-sdk/provider';
import type { LlmProvider } from '@chess-coach/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { vi } from 'vitest';
import type { ModelResolution } from '../../src/llm/gateway.js';

export interface MockToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface MockStep {
  text?: string;
  /** The model's thinking for this step. Routed to the debug snapshot, never
   * to the student's transcript. */
  reasoning?: string;
  toolCall?: MockToolCall;
  finishReason: 'stop' | 'tool-calls' | 'length' | 'error' | 'other' | 'content-filter';
}

export function mockUsage(inputTokens = 10, outputTokens = 5): LanguageModelV4Usage {
  return {
    inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: outputTokens, text: outputTokens, reasoning: undefined }
  };
}

/** The parts one model step emits, in the order a real provider emits them.
 * Text always arrives as a start/delta/end triple in this SDK version — a bare
 * delta with no matching start is dropped. */
export function stepParts(step: MockStep, usage = mockUsage()): LanguageModelV4StreamPart[] {
  const parts: LanguageModelV4StreamPart[] = [];
  if (step.reasoning !== undefined) {
    parts.push({ type: 'reasoning-start', id: 'reasoning-1' });
    parts.push({ type: 'reasoning-delta', id: 'reasoning-1', delta: step.reasoning });
    parts.push({ type: 'reasoning-end', id: 'reasoning-1' });
  }
  if (step.text !== undefined) {
    parts.push({ type: 'text-start', id: 'text-1' });
    parts.push({ type: 'text-delta', id: 'text-1', delta: step.text });
    parts.push({ type: 'text-end', id: 'text-1' });
  }
  if (step.toolCall) {
    parts.push({
      type: 'tool-call',
      toolCallId: step.toolCall.toolCallId,
      toolName: step.toolCall.toolName,
      input: JSON.stringify(step.toolCall.input)
    });
  }
  parts.push({
    type: 'finish',
    finishReason: { unified: step.finishReason, raw: undefined },
    usage
  });
  return parts;
}

/** A model whose stream stays open until `finish()` is called, so a test can
 * control exactly when onFinish fires (the trigger for this turn's
 * persistence, and therefore for the per-session lock releasing). */
export function controllableStreamModel(
  text: string,
  toolCall: MockToolCall
): { model: MockLanguageModelV4; finish: () => Promise<void> } {
  let controllerRef: ReadableStreamDefaultController<LanguageModelV4StreamPart> | undefined;
  const model = new MockLanguageModelV4({
    doStream: () =>
      Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controllerRef = controller;
          }
        })
      })
  });

  const finish = async (): Promise<void> => {
    while (!controllerRef) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    for (const part of stepParts({ text, toolCall, finishReason: 'tool-calls' }, mockUsage(500, 50))) {
      controllerRef.enqueue(part);
    }
    controllerRef.close();
  };

  return { model, finish };
}

/** A model that emits one step's worth of text and closes immediately. */
export function instantTextModel(text: string): MockLanguageModelV4 {
  return multiStepModel([{ text, finishReason: 'stop' }]);
}

/** Resolves each of `steps` in order — one doStream() call per step. Used for
 * turns where the model calls a SERVER-executed tool (has an `execute`, e.g.
 * record_move_note): the SDK auto-runs the tool and calls doStream() again for
 * the follow-up step, unlike client tools (show_position) which end the turn
 * at the tool-call. */
export function multiStepModel(steps: MockStep[]): MockLanguageModelV4 {
  let call = 0;
  const doStream = vi.fn().mockImplementation(() => {
    const step = steps[call++];
    if (!step) throw new Error('multiStepModel: doStream called more times than steps provided');
    return Promise.resolve({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          for (const part of stepParts(step)) controller.enqueue(part);
          controller.close();
        }
      })
    });
  });
  return new MockLanguageModelV4({ doStream });
}

/** The `content` parts one `doGenerate` step returns, mirroring `stepParts`
 * for the streaming path — used by `runBoundedToolLoop` (`generateText`
 * calls `doGenerate` once per step, never `doStream`). */
function generateContent(step: MockStep): LanguageModelV4Content[] {
  const content: LanguageModelV4Content[] = [];
  if (step.reasoning !== undefined) content.push({ type: 'reasoning', text: step.reasoning });
  if (step.text !== undefined) content.push({ type: 'text', text: step.text });
  if (step.toolCall) {
    content.push({
      type: 'tool-call',
      toolCallId: step.toolCall.toolCallId,
      toolName: step.toolCall.toolName,
      input: JSON.stringify(step.toolCall.input)
    });
  }
  return content;
}

/** Resolves each of `steps` in order — one doGenerate() call per step. The
 * `generateText`-based counterpart to `multiStepModel` (which drives
 * `doStream` for `streamText`). */
export function multiStepGenerateModel(steps: MockStep[]): MockLanguageModelV4 {
  let call = 0;
  const doGenerate = vi.fn().mockImplementation((): Promise<LanguageModelV4GenerateResult> => {
    const step = steps[call++];
    if (!step) throw new Error('multiStepGenerateModel: doGenerate called more times than steps provided');
    return Promise.resolve({
      content: generateContent(step),
      finishReason: { unified: step.finishReason, raw: undefined },
      usage: mockUsage(),
      warnings: []
    });
  });
  return new MockLanguageModelV4({ doGenerate });
}

/** A model that fails mid-stream: onFinish never runs, only onError. */
export function erroringStreamModel(error: Error): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: () =>
      Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'error', error });
            controller.close();
          }
        })
      })
  });
}

/** Wraps a mock model as the gateway would resolve it, so tests can inject it
 * through `CoachAgentDependencies.resolveModel`. */
export function mockResolution(
  model: MockLanguageModelV4,
  overrides: Partial<Omit<ModelResolution, 'model'>> = {}
): ModelResolution {
  return {
    model,
    metered: true,
    provider: 'anthropic' as LlmProvider,
    modelId: 'claude-standard',
    callOptions: { reasoning: 'medium' },
    ...overrides
  };
}

/** Consumes a turn's stream so the SDK processes it through to onFinish. */
export async function drain(turn: { stream: ReadableStream<unknown> }): Promise<void> {
  const reader = turn.stream.getReader();
  try {
    for (;;) {
      const { done } = await reader.read();
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
