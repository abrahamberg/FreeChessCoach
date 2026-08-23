import { describe, expect, test, vi } from 'vitest';
import { SharedTtsWorker, type TtsSpeakMessage, type TtsWorkerLike, type TtsWorkerMessage } from './shared-tts-worker.js';

function fakeTtsWorker(): TtsWorkerLike & { sent: TtsSpeakMessage[]; emit: (data: TtsWorkerMessage) => void } {
  const sent: TtsSpeakMessage[] = [];
  const worker: TtsWorkerLike & { sent: TtsSpeakMessage[]; emit: (data: TtsWorkerMessage) => void } = {
    sent,
    onmessage: null,
    postMessage: (message) => sent.push(message),
    terminate: vi.fn(),
    emit: (data) => worker.onmessage?.({ data })
  };
  return worker;
}

describe('SharedTtsWorker', () => {
  test('does not construct a worker until the first speak() call', () => {
    const createWorker = vi.fn(() => fakeTtsWorker());
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const client = new SharedTtsWorker({ createWorker });
    expect(createWorker).not.toHaveBeenCalled();
  });

  test('posts a speak request with the given text and voice', () => {
    const worker = fakeTtsWorker();
    const client = new SharedTtsWorker({ createWorker: () => worker });

    void client.speak({ text: 'hello', voice: 'af_heart' }, () => {});

    expect(worker.sent).toHaveLength(1);
    expect(worker.sent[0]).toMatchObject({ type: 'speak', text: 'hello', voice: 'af_heart' });
    expect(worker.sent[0]?.id).toEqual(expect.any(String));
  });

  test('delivers each chunk via onChunk, in order, as it arrives', () => {
    const worker = fakeTtsWorker();
    const client = new SharedTtsWorker({ createWorker: () => worker });
    const received: Array<{ index: number; audio: ArrayBuffer }> = [];

    void client.speak({ text: 'hello', voice: 'af_heart' }, (index, audio) => received.push({ index, audio }));
    const id = worker.sent[0]?.id ?? '';
    const chunk0 = new ArrayBuffer(1);
    const chunk1 = new ArrayBuffer(2);
    worker.emit({ type: 'chunk', id, index: 0, audio: chunk0 });
    worker.emit({ type: 'chunk', id, index: 1, audio: chunk1 });

    expect(received).toEqual([
      { index: 0, audio: chunk0 },
      { index: 1, audio: chunk1 }
    ]);
  });

  test('resolves once a done message arrives, after any chunks', async () => {
    const worker = fakeTtsWorker();
    const client = new SharedTtsWorker({ createWorker: () => worker });

    const pending = client.speak({ text: 'hello', voice: 'af_heart' }, () => {});
    const id = worker.sent[0]?.id ?? '';
    worker.emit({ type: 'chunk', id, index: 0, audio: new ArrayBuffer(1) });
    worker.emit({ type: 'done', id });

    await expect(pending).resolves.toBeUndefined();
  });

  test('rejects with an Error on an error message', async () => {
    const worker = fakeTtsWorker();
    const client = new SharedTtsWorker({ createWorker: () => worker });

    const pending = client.speak({ text: 'hello', voice: 'af_heart' }, () => {});
    const id = worker.sent[0]?.id ?? '';
    worker.emit({ type: 'error', id, message: 'boom' });

    await expect(pending).rejects.toThrow('boom');
  });

  test('relays status messages to subscribers, absent until the worker reports otherwise', () => {
    const worker = fakeTtsWorker();
    const client = new SharedTtsWorker({ createWorker: () => worker });
    const statuses: string[] = [];
    client.subscribe((status) => statuses.push(status));

    expect(statuses).toEqual(['absent']);

    void client.speak({ text: 'hi', voice: 'af_heart' }, () => {});
    worker.emit({ type: 'status', status: 'loading' });
    worker.emit({ type: 'status', status: 'ready' });

    expect(statuses).toEqual(['absent', 'loading', 'ready']);
  });

  test('serializes concurrent speak() calls — the second is not sent until the first resolves', async () => {
    const worker = fakeTtsWorker();
    const client = new SharedTtsWorker({ createWorker: () => worker });

    const first = client.speak({ text: 'one', voice: 'af_heart' }, () => {});
    const second = client.speak({ text: 'two', voice: 'af_heart' }, () => {});
    expect(worker.sent).toHaveLength(1);

    const firstId = worker.sent[0]?.id ?? '';
    worker.emit({ type: 'done', id: firstId });
    await first;

    expect(worker.sent).toHaveLength(2);
    const secondId = worker.sent[1]?.id ?? '';
    worker.emit({ type: 'done', id: secondId });
    await second;
  });

  test('reuses the same worker instance across multiple speak() calls', async () => {
    const worker = fakeTtsWorker();
    const createWorker = vi.fn(() => worker);
    const client = new SharedTtsWorker({ createWorker });

    const first = client.speak({ text: 'one', voice: 'af_heart' }, () => {});
    worker.emit({ type: 'done', id: worker.sent[0]?.id ?? '' });
    await first;

    const second = client.speak({ text: 'two', voice: 'af_heart' }, () => {});
    worker.emit({ type: 'done', id: worker.sent[1]?.id ?? '' });
    await second;

    expect(createWorker).toHaveBeenCalledOnce();
  });

  test('a worker that fails to construct rejects the pending speak() and reports absent', async () => {
    const client = new SharedTtsWorker({
      createWorker: () => {
        throw new Error('no Worker support');
      }
    });

    await expect(client.speak({ text: 'hi', voice: 'af_heart' }, () => {})).rejects.toThrow('no Worker support');
    expect(client.status).toBe('absent');
  });
});
