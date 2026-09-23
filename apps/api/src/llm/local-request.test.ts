import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, test } from 'vitest';
import { buildLocalChatBody } from './local-request.js';

const USER_PROMPT: LanguageModelV4CallOptions['prompt'] = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }];
const WITH_CONTROLS = { stream: false, sendThinkingControls: true };

describe('buildLocalChatBody', () => {
  test('sends the SDK reasoning setting as reasoning_effort, and turns thinking off in the template for none', () => {
    expect(buildLocalChatBody('m', { prompt: USER_PROMPT, reasoning: 'low' }, WITH_CONTROLS)).toMatchObject({ reasoning_effort: 'low' });
    const off = buildLocalChatBody('m', { prompt: USER_PROMPT, reasoning: 'none' }, WITH_CONTROLS);
    expect(off).toMatchObject({ reasoning_effort: 'none', chat_template_kwargs: { enable_thinking: false } });
    const unset = buildLocalChatBody('m', { prompt: USER_PROMPT, reasoning: 'provider-default' }, WITH_CONTROLS);
    expect(unset).not.toHaveProperty('reasoning_effort');
  });

  test('omits thinking fields for a server that rejected them', () => {
    const body = buildLocalChatBody('m', { prompt: USER_PROMPT, reasoning: 'none' }, { stream: false, sendThinkingControls: false });
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('chat_template_kwargs');
  });

  test('forwards a JSON schema as response_format', () => {
    const schema = { type: 'object', properties: { a: { type: 'string' } } } as const;
    const body = buildLocalChatBody('m', { prompt: USER_PROMPT, responseFormat: { type: 'json', schema, name: 'plan' } }, WITH_CONTROLS);
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'plan', schema, strict: true } });
  });

  test('keeps earlier tool calls and sends one tool message per result', () => {
    const prompt: LanguageModelV4CallOptions['prompt'] = [
      { role: 'system', content: 'coach' },
      ...USER_PROMPT,
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'thinking' },
          { type: 'tool-call', toolCallId: 'c1', toolName: 'show_move', input: { ply: 3 } },
          { type: 'tool-call', toolCallId: 'c2', toolName: 'check_moves', input: '{"moves":["e4"]}' }
        ]
      },
      {
        role: 'tool',
        content: [
          { type: 'tool-result', toolCallId: 'c1', toolName: 'show_move', output: { type: 'json', value: { ok: true } } },
          { type: 'tool-result', toolCallId: 'c2', toolName: 'check_moves', output: { type: 'text', value: 'fine' } }
        ]
      }
    ];
    const body = buildLocalChatBody('m', { prompt }, WITH_CONTROLS);
    expect(body.messages).toEqual([
      { role: 'system', content: 'coach' },
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'show_move', arguments: '{"ply":3}' } },
          { id: 'c2', type: 'function', function: { name: 'check_moves', arguments: '{"moves":["e4"]}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'c1', content: '{"ok":true}' },
      { role: 'tool', tool_call_id: 'c2', content: 'fine' }
    ]);
  });

  test('maps a forced tool choice to the OpenAI object form', () => {
    const body = buildLocalChatBody(
      'm',
      {
        prompt: USER_PROMPT,
        tools: [{ type: 'function', name: 'show_move', description: 'd', inputSchema: { type: 'object' } }],
        toolChoice: { type: 'tool', toolName: 'show_move' }
      },
      WITH_CONTROLS
    );
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'show_move' } });
    expect(body.tools).toEqual([{ type: 'function', function: { name: 'show_move', description: 'd', parameters: { type: 'object' } } }]);
  });

  test('asks for usage on a stream and does not invent a temperature', () => {
    const body = buildLocalChatBody('m', { prompt: USER_PROMPT }, { stream: true, sendThinkingControls: true });
    expect(body).toMatchObject({ stream: true, stream_options: { include_usage: true } });
    expect(body).not.toHaveProperty('temperature');
  });
});
