import type { StreamStep } from './conversationScript.js';

export interface StreamPacing {
  /** How long the visitor sees the thinking indicator before the first word. */
  thinkingMs: number;
  /** Gap between two chunks of text, so it reads as being typed. */
  chunkMs: number;
  sleep: (ms: number) => Promise<void>;
}

export const DEFAULT_PACING: StreamPacing = {
  thinkingMs: 1600,
  chunkMs: 28,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
};

const WORDS_PER_CHUNK = 2;

/** A fake `POST /api/sessions/:id/messages` reply: the same Server-Sent Events
 * the real server sends (AI SDK UI message chunks), so the app's own reader,
 * thinking indicator and board-moving code run exactly as they do live. */
export function scriptedStreamResponse(steps: StreamStep[], pacing: StreamPacing = DEFAULT_PACING, onDone?: () => void): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: unknown): void => controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      await pacing.sleep(pacing.thinkingMs);
      send({ type: 'start' });
      for (const [index, step] of steps.entries()) await emitStep(step, index, send, pacing);
      send({ type: 'finish' });
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
      onDone?.();
    }
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}

async function emitStep(step: StreamStep, index: number, send: (chunk: unknown) => void, pacing: StreamPacing): Promise<void> {
  if (step.kind === 'show_position') {
    send({
      type: 'tool-input-available',
      toolCallId: `demo-show-position-${index}`,
      toolName: 'show_position',
      input: { moveNumber: step.moveNumber, color: step.color }
    });
    return;
  }
  const id = `demo-text-${index}`;
  send({ type: 'text-start', id });
  for (const delta of textChunks(step.text)) {
    send({ type: 'text-delta', id, delta });
    await pacing.sleep(pacing.chunkMs);
  }
  send({ type: 'text-end', id });
}

/** Splits on word boundaries, keeping the whitespace, so joining gives back the text. */
function textChunks(text: string): string[] {
  const words = text.match(/\S+\s*/g) ?? [];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) chunks.push(words.slice(i, i + WORDS_PER_CHUNK).join(''));
  return chunks;
}
