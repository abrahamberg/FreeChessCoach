import { DemoConversation } from './demoConversation.js';
import { createDemoFetch, type DemoFixtures } from './demoFetch.js';
import type { RecordedMessage } from './conversationScript.js';
import { NoticeStore, PersonaStore, setDemoRuntime } from './demoRuntime.js';
import { rebaseDates } from './rebaseDates.js';

type RecordedFixtures = DemoFixtures & { recordedAt: string };

/** Turns the page into the offline demo: every `/api` call is answered from the
 * recorded sample data, and the live streams (analysis progress) are not opened.
 * Called once, before the app renders. */
export async function installDemo(): Promise<void> {
  const recorded = (await import('./fixtures.json')).default as RecordedFixtures;
  const fixtures = rebaseDates(recorded, recorded.recordedAt, new Date());
  const session = fixtures.base[`/api/sessions/${fixtures.sessionId}`] as { messages: RecordedMessage[] };
  const persona = new PersonaStore();
  const conversation = new DemoConversation(session.messages);
  const notice = new NoticeStore();
  setDemoRuntime({ conversation, persona, notice, coachSessionId: fixtures.sessionId });
  window.fetch = createDemoFetch({
    fixtures,
    conversation,
    persona: persona.get,
    realFetch: window.fetch.bind(window),
    onRefused: (message) => notice.show(message)
  });
  silenceLiveStreams();
}

/** EventSource would open real connections to `/api/analyses/...`, which the
 * demo does not have. Nothing the demo shows is still being analysed. */
function silenceLiveStreams(): void {
  class NoStream {
    onerror: (() => void) | null = null;
    close(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
  }
  (window as unknown as { EventSource: unknown }).EventSource = NoStream;
}
