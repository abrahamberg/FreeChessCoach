import { describe, expect, test, vi } from 'vitest';
import { TunnelError, UnifiedTunnelRegistry, type TunnelConnection } from './unified-tunnel-registry.js';

const CHAT = { kind: 'llm', subKind: 'chat-stream', baseUrl: 'http://localhost:1234/v1', body: {} } as const;

/** Records requests in `sent` and `role` frames separately in `roles`. */
function fakeConnection(): TunnelConnection & { sent: Array<Record<string, unknown>>; roles: boolean[]; reply(frame: object): void } {
  const connection = {
    sent: [] as Array<Record<string, unknown>>,
    roles: [] as boolean[],
    onmessage: null as TunnelConnection['onmessage'],
    send(message: string) {
      const frame = JSON.parse(message) as Record<string, unknown>;
      if (frame.type === 'role') connection.roles.push(frame.active === true);
      else connection.sent.push(frame);
    },
    reply(frame: object) {
      connection.onmessage?.({ data: JSON.stringify(frame) });
    }
  };
  return connection;
}

async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

describe('UnifiedTunnelRegistry.stream', () => {
  test('yields chunk frames in order and ends on done', async () => {
    const registry = new UnifiedTunnelRegistry();
    const connection = fakeConnection();
    registry.registerConnection('u', connection);
    const reading = collect(registry.stream('u', CHAT, { idleTimeoutMs: 1000 }));
    await vi.waitFor(() => expect(connection.sent).toHaveLength(1));
    const requestId = connection.sent[0]?.requestId;
    connection.reply({ requestId, chunk: 'a' });
    connection.reply({ requestId, chunk: 'b' });
    connection.reply({ requestId, done: true });
    await expect(reading).resolves.toEqual(['a', 'b']);
  });

  test('fails when the tab goes quiet longer than the idle timeout', async () => {
    const registry = new UnifiedTunnelRegistry();
    registry.registerConnection('u', fakeConnection());
    await expect(collect(registry.stream('u', CHAT, { idleTimeoutMs: 20 }))).rejects.toThrow('idle');
  });

  test('an error frame fails the stream', async () => {
    const registry = new UnifiedTunnelRegistry();
    const connection = fakeConnection();
    registry.registerConnection('u', connection);
    const reading = collect(registry.stream('u', CHAT, { idleTimeoutMs: 1000 }));
    await vi.waitFor(() => expect(connection.sent).toHaveLength(1));
    connection.reply({ requestId: connection.sent[0]?.requestId, ok: false, error: 'Local LLM error (400)' });
    await expect(reading).rejects.toBeInstanceOf(TunnelError);
  });

  test('stopping early tells the tab to cancel', async () => {
    const registry = new UnifiedTunnelRegistry();
    const connection = fakeConnection();
    registry.registerConnection('u', connection);
    const iterator = registry.stream('u', CHAT, { idleTimeoutMs: 1000 });
    const first = iterator.next();
    await vi.waitFor(() => expect(connection.sent).toHaveLength(1));
    const requestId = connection.sent[0]?.requestId;
    connection.reply({ requestId, chunk: 'a' });
    await first;
    await iterator.return(undefined);
    expect(connection.sent[1]).toEqual({ type: 'cancel', requestId });
  });

  test('answers a ping with a pong', () => {
    const registry = new UnifiedTunnelRegistry();
    const connection = fakeConnection();
    registry.registerConnection('u', connection);
    connection.reply({ type: 'ping' });
    expect(connection.sent).toEqual([{ type: 'pong' }]);
  });
});

describe('UnifiedTunnelRegistry with several tabs', () => {
  const ENGINE = { kind: 'engine', subKind: 'analyze-position', fen: 'startpos', depth: 8, multiPv: 1 } as const;

  test('a newly opened tab does not take over from the incumbent (neither has reported activity)', async () => {
    const registry = new UnifiedTunnelRegistry();
    const older = fakeConnection();
    const newer = fakeConnection();
    registry.registerConnection('u', older);
    registry.registerConnection('u', newer);
    void registry.request('u', ENGINE, 1000).catch(() => undefined);
    await vi.waitFor(() => expect(older.sent).toHaveLength(1));
    expect(newer.sent).toHaveLength(0);
  });

  test('when the newest tab closes, the older still-open tab takes over', async () => {
    const registry = new UnifiedTunnelRegistry();
    const older = fakeConnection();
    const newer = fakeConnection();
    registry.registerConnection('u', older);
    registry.registerConnection('u', newer);
    registry.unregisterConnection('u', newer);
    expect(registry.isConnected('u')).toBe(true);
    const answer = registry.request('u', ENGINE, 1000);
    await vi.waitFor(() => expect(older.sent).toHaveLength(1));
    older.reply({ requestId: older.sent[0]?.requestId, ok: true, result: 'ok' });
    await expect(answer).resolves.toBe('ok');
  });

  test('opening another tab does not fail a request the first tab is answering', async () => {
    const registry = new UnifiedTunnelRegistry();
    const first = fakeConnection();
    registry.registerConnection('u', first);
    const answer = registry.request('u', ENGINE, 1000);
    await vi.waitFor(() => expect(first.sent).toHaveLength(1));
    registry.registerConnection('u', fakeConnection());
    first.reply({ requestId: first.sent[0]?.requestId, ok: true, result: 'ok' });
    await expect(answer).resolves.toBe('ok');
  });

  test('closing a tab fails only its own requests', async () => {
    const registry = new UnifiedTunnelRegistry();
    const older = fakeConnection();
    const newer = fakeConnection();
    registry.registerConnection('u', older);
    const onOlder = registry.request('u', ENGINE, 1000);
    registry.registerConnection('u', newer);
    newer.reply({ type: 'active', at: 1 }); // explicit takeover, not just opening the tab
    const onNewer = registry.request('u', ENGINE, 1000);
    await vi.waitFor(() => expect(newer.sent).toHaveLength(1));
    registry.unregisterConnection('u', newer);
    await expect(onNewer).rejects.toThrow('Connection unregistered');
    older.reply({ requestId: older.sent[0]?.requestId, ok: true, result: 'ok' });
    await expect(onOlder).resolves.toBe('ok');
  });

  test('new requests go to the most recently used tab, whatever the connect order', async () => {
    const registry = new UnifiedTunnelRegistry();
    const used = fakeConnection();
    const background = fakeConnection();
    registry.registerConnection('u', used);
    registry.registerConnection('u', background);
    used.reply({ type: 'active', at: 2000 });
    background.reply({ type: 'active', at: 1000 });
    void registry.request('u', ENGINE, 1000).catch(() => undefined);
    await vi.waitFor(() => expect(used.sent).toHaveLength(1));
    expect(background.sent).toHaveLength(0);

    background.reply({ type: 'active', at: 3000 });
    void registry.request('u', ENGINE, 1000).catch(() => undefined);
    await vi.waitFor(() => expect(background.sent).toHaveLength(1));
  });

  test('tells each tab whether it is the active one', () => {
    const registry = new UnifiedTunnelRegistry();
    const first = fakeConnection();
    const second = fakeConnection();
    registry.registerConnection('u', first);
    registry.registerConnection('u', second);
    // Opening `second` is not a takeover: `first` stays active, so it gets
    // no new role frame (unchanged), and `second` starts out inactive.
    expect(first.roles).toEqual([true]);
    expect(second.roles).toEqual([false]);
    first.reply({ type: 'active', at: 5000 });
    expect(first.roles.at(-1)).toBe(true);
    expect(second.roles.at(-1)).toBe(false);
    registry.unregisterConnection('u', first);
    expect(second.roles.at(-1)).toBe(true);
  });
});
