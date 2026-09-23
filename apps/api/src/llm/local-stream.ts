import type { LanguageModelV4StreamPart, LanguageModelV4Usage } from '@ai-sdk/provider';
import { LocalModelEmptyAnswerError, mapFinishReason, mapUsage } from './local-response.js';

interface WireDelta {
  content?: unknown;
  reasoning_content?: unknown;
  reasoning?: unknown;
  tool_calls?: Array<{ index?: unknown; id?: unknown; function?: { name?: unknown; arguments?: unknown } }>;
}

interface WireChunk {
  choices?: Array<{ delta?: WireDelta; finish_reason?: unknown }>;
  usage?: Parameters<typeof mapUsage>[0];
}

interface PendingToolCall {
  id: string;
  name: string;
  args: string;
  started: boolean;
}

const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';
const TEXT_ID = 'text-0';

/**
 * Turns a local server's streamed Chat Completions chunks (one SSE `data:`
 * payload each) into AI SDK stream parts as they arrive: thinking as
 * reasoning deltas (so the coach's stall guard sees progress while the model
 * thinks), answer text as text deltas, and tool calls as tool-input parts
 * followed by a complete `tool-call` when the stream ends.
 */
export class LocalStreamMapper {
  constructor(private readonly reasoningId = 'reasoning-0') {}

  private textOpen = false;
  private textEverOpened = false;
  private reasoningOpen = false;
  /** Inline `<think>` handling: undecided until the first non-space text. */
  private inlineMode: 'undecided' | 'thinking' | 'answer' = 'undecided';
  private held = '';
  private toolCalls = new Map<number, PendingToolCall>();
  private finishRaw: string | null = null;
  private usage: LanguageModelV4Usage = mapUsage(undefined);

  push(data: string): LanguageModelV4StreamPart[] {
    if (data.trim() === '[DONE]') return [];
    const chunk = parseChunk(data);
    if (!chunk) return [];
    if (chunk.usage) this.usage = mapUsage(chunk.usage);
    const choice = chunk.choices?.[0];
    if (!choice) return [];
    if (typeof choice.finish_reason === 'string') this.finishRaw = choice.finish_reason;
    const delta = choice.delta ?? {};
    return [
      ...this.reasoning(asString(delta.reasoning_content) || asString(delta.reasoning)),
      ...this.content(asString(delta.content)),
      ...this.tools(delta.tool_calls ?? [])
    ];
  }

  /** Ends the open thinking block when the caller gives up on this stream
   * (its thinking ran past the budget) so the retry can start a new one. */
  abandonThinking(): LanguageModelV4StreamPart[] {
    return this.closeReasoning();
  }

  finish(): LanguageModelV4StreamPart[] {
    const parts: LanguageModelV4StreamPart[] = [];
    if (this.held) {
      parts.push(...(this.inlineMode === 'thinking' ? this.reasoning(this.held) : this.text(this.held)));
      this.held = '';
    }
    parts.push(...this.closeReasoning());
    if (this.textOpen) parts.push({ type: 'text-end', id: TEXT_ID });
    for (const call of this.toolCalls.values()) {
      if (!call.started) parts.push({ type: 'tool-input-start', id: call.id, toolName: call.name });
      parts.push({ type: 'tool-input-end', id: call.id });
      parts.push({ type: 'tool-call', toolCallId: call.id, toolName: call.name, input: call.args || '{}' });
    }
    // Matches doGenerate's guard (local-response.ts): a model that spends its
    // whole budget thinking and streams no text and no tool call must not
    // silently finish blank — surface the same friendly error instead.
    if (!this.textEverOpened && this.toolCalls.size === 0) {
      parts.push({ type: 'error', error: new LocalModelEmptyAnswerError(this.finishRaw) });
      return parts;
    }
    parts.push({ type: 'finish', finishReason: mapFinishReason(this.finishRaw), usage: this.usage });
    return parts;
  }

  private content(delta: string): LanguageModelV4StreamPart[] {
    if (!delta) return [];
    if (this.inlineMode === 'answer') return this.text(delta);
    this.held += delta;
    if (this.inlineMode === 'undecided') return this.decideInlineMode();
    return this.drainInlineThinking();
  }

  private decideInlineMode(): LanguageModelV4StreamPart[] {
    const trimmed = this.held.trimStart();
    if (trimmed === '' || (OPEN_TAG.startsWith(trimmed) && trimmed.length < OPEN_TAG.length)) return [];
    if (trimmed.startsWith(OPEN_TAG)) {
      this.inlineMode = 'thinking';
      this.held = trimmed.slice(OPEN_TAG.length);
      return this.drainInlineThinking();
    }
    this.inlineMode = 'answer';
    const text = this.held;
    this.held = '';
    return this.text(text);
  }

  private drainInlineThinking(): LanguageModelV4StreamPart[] {
    const close = this.held.indexOf(CLOSE_TAG);
    if (close !== -1) {
      const thinking = this.held.slice(0, close);
      const rest = this.held.slice(close + CLOSE_TAG.length).trimStart();
      this.held = '';
      this.inlineMode = 'answer';
      return [...this.reasoning(thinking), ...this.closeReasoning(), ...this.text(rest)];
    }
    // Keep back anything that could be the start of `</think>`.
    const safe = this.held.length - (CLOSE_TAG.length - 1);
    if (safe <= 0) return [];
    const thinking = this.held.slice(0, safe);
    this.held = this.held.slice(safe);
    return this.reasoning(thinking);
  }

  private reasoning(delta: string): LanguageModelV4StreamPart[] {
    if (!delta) return [];
    const parts: LanguageModelV4StreamPart[] = [];
    if (!this.reasoningOpen) {
      this.reasoningOpen = true;
      parts.push({ type: 'reasoning-start', id: this.reasoningId });
    }
    parts.push({ type: 'reasoning-delta', id: this.reasoningId, delta });
    return parts;
  }

  private closeReasoning(): LanguageModelV4StreamPart[] {
    if (!this.reasoningOpen) return [];
    this.reasoningOpen = false;
    return [{ type: 'reasoning-end', id: this.reasoningId }];
  }

  private text(delta: string): LanguageModelV4StreamPart[] {
    if (!delta) return [];
    const parts = this.closeReasoning();
    if (!this.textOpen) {
      this.textOpen = true;
      this.textEverOpened = true;
      parts.push({ type: 'text-start', id: TEXT_ID });
    }
    parts.push({ type: 'text-delta', id: TEXT_ID, delta });
    return parts;
  }

  private tools(deltas: NonNullable<WireDelta['tool_calls']>): LanguageModelV4StreamPart[] {
    const parts: LanguageModelV4StreamPart[] = [];
    for (const delta of deltas) {
      const index = typeof delta.index === 'number' ? delta.index : this.toolCalls.size;
      const call = this.toolCalls.get(index) ?? { id: `local-call-${index}`, name: '', args: '', started: false };
      this.toolCalls.set(index, call);
      if (typeof delta.id === 'string' && delta.id && !call.started) call.id = delta.id;
      call.name += asString(delta.function?.name);
      const args = asString(delta.function?.arguments);
      if (!call.started && call.name) {
        call.started = true;
        parts.push(...this.closeReasoning(), { type: 'tool-input-start', id: call.id, toolName: call.name });
        if (call.args) parts.push({ type: 'tool-input-delta', id: call.id, delta: call.args });
      }
      call.args += args;
      if (call.started && args) parts.push({ type: 'tool-input-delta', id: call.id, delta: args });
    }
    return parts;
  }
}

function parseChunk(data: string): WireChunk | null {
  try {
    const parsed: unknown = JSON.parse(data);
    return typeof parsed === 'object' && parsed !== null ? (parsed as WireChunk) : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
