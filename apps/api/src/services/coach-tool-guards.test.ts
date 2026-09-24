import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../llm/messages.js';
import { BUDGET_EXHAUSTED, replyInProgress, withTurnGuards } from './coach-tool-guards.js';

function toolCallStep(toolName: string, toolCallId: string, input: unknown): ChatMessage[] {
  return [
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId, toolName, input }] },
    {
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId, toolName, output: { type: 'json', value: { ok: true } } }]
    }
  ];
}

describe('replyInProgress', () => {
  it('counts only the steps and calls after the student’s last message', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'earlier' },
      ...toolCallStep('get_engine_analysis', 'a', { fen: 'x' }),
      { role: 'assistant', content: 'Here is what I see.' },
      { role: 'user', content: 'ok' },
      ...toolCallStep('get_engine_analysis', 'b', { fen: 'x' }),
      ...toolCallStep('annotate_board', 'c', { arrows: [], highlights: [] })
    ];

    const reply = replyInProgress(messages);

    expect(reply.priorSteps).toBe(2);
    expect(reply.state.callCounts.get('get_engine_analysis')).toBe(1);
    expect(reply.state.callCounts.get('annotate_board')).toBe(1);
  });

  // Regression: a local model alternated get_engine_analysis and the
  // annotate_board client tool; every client round trip started a fresh turn,
  // so the per-turn budget of 2 never fired and the reply looped forever.
  it('carries the engine-analysis budget across client-tool round trips', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'ok' },
      ...toolCallStep('get_engine_analysis', 'a', { fen: 'x' }),
      ...toolCallStep('annotate_board', 'b', { arrows: [], highlights: [] }),
      ...toolCallStep('get_engine_analysis', 'c', { fen: 'y' }),
      ...toolCallStep('annotate_board', 'd', { arrows: [], highlights: [] })
    ];
    const guarded = withTurnGuards(replyInProgress(messages).state, 'get_engine_analysis', () => Promise.resolve('analysis'));

    await expect(guarded({ fen: 'z' })).resolves.toBe(BUDGET_EXHAUSTED);
  });
});
