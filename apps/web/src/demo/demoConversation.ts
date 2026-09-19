import { splitConversation, streamsForTurn, type RecordedMessage, type ScriptedTurn, type StreamStep } from './conversationScript.js';
import { DEFAULT_PACING, scriptedStreamResponse, type StreamPacing } from './scriptedStream.js';

/** What the browser POSTs to /api/sessions/:id/messages: a student message, or
 * the answer to a client tool call (show_position) that continues the same turn. */
export type DemoTurnRequest = { content: string } | { clientToolResult: unknown };

export interface DemoConversationState {
  nextLine: string | null;
  busy: boolean;
}

/** The scripted coach. It never calls a model: each time the visitor sends the
 * line offered in the composer, the next recorded coach reply streams back. */
export class DemoConversation {
  private readonly history: RecordedMessage[];
  private readonly turns: ScriptedTurn[];
  private readonly recorded: RecordedMessage[];
  private played = 0;
  private busy = false;
  private snapshot: DemoConversationState;
  private pendingStreams: StreamStep[][] = [];
  private readonly listeners = new Set<() => void>();

  constructor(
    recorded: RecordedMessage[],
    private readonly pacing: StreamPacing = DEFAULT_PACING
  ) {
    const { history, turns } = splitConversation(recorded);
    this.recorded = recorded;
    this.history = history;
    this.turns = turns;
    this.snapshot = this.readState();
  }

  /** What the composer shows: the line it offers next (null once the script is
   * over), and whether the coach is still answering. A stable object between
   * changes, as useSyncExternalStore requires. */
  state(): DemoConversationState {
    return this.snapshot;
  }

  reply(request: DemoTurnRequest): Response {
    return 'content' in request ? this.startTurn() : this.nextStream();
  }

  /** The transcript a reopened session shows: the history plus the turns played so far. */
  visibleMessages(): RecordedMessage[] {
    if (this.played === 0) return this.history;
    let studentMessages = 0;
    return this.recorded.filter((message, index) => {
      if (index < this.history.length) return true;
      if (message.role === 'user') studentMessages += 1;
      return studentMessages <= this.played;
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private startTurn(): Response {
    const turn = this.turns[this.played];
    if (!turn) return problem(409, 'That is the end of the demo conversation. Sign in to coach your own games.');
    this.played += 1;
    this.busy = true;
    this.pendingStreams = streamsForTurn(turn);
    const response = this.nextStream();
    this.notify();
    return response;
  }

  /** The turn is over once its last stream has been read to the end. */
  private nextStream(): Response {
    const steps = this.pendingStreams.shift() ?? [];
    const isLast = this.pendingStreams.length === 0;
    return scriptedStreamResponse(steps, this.pacing, isLast ? () => this.finishTurn() : undefined);
  }

  private finishTurn(): void {
    this.busy = false;
    this.notify();
  }

  private readState(): DemoConversationState {
    return { nextLine: this.turns[this.played]?.userText ?? null, busy: this.busy };
  }

  private notify(): void {
    this.snapshot = this.readState();
    for (const listener of this.listeners) listener();
  }
}

function problem(status: number, title: string): Response {
  return new Response(JSON.stringify({ type: 'about:blank', title, status }), {
    status,
    headers: { 'content-type': 'application/problem+json' }
  });
}
