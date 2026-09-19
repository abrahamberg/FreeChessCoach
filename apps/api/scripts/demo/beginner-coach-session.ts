/** The coaching session on the featured game (the Caro-Kann loss with the
 * missed rook), written to match what the engine really found there:
 *   32. Ne4 removed the only defender of White's rook on c1, so 32...Qxc1+ won it;
 *   37. Qxd2 took Black's queen, and 37...Rxd2+ recaptured, but Black played ...Ng5
 *   and lost the rook to 38. Qxd8+.
 * The coach asks before it tells (docs/prompts.md), and never quotes engine numbers. */
export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  /** Moves the board to this position (a `show_position` tool call). */
  showPosition?: { moveNumber: number; color: 'white' | 'black' };
  /** The game ply this exchange is about, for the coach's own replay context. */
  ply: number;
}

export const FEATURED_SUBJECT_PLY = 73;

export const COACH_TRANSCRIPT: TranscriptEntry[] = [
  {
    role: 'assistant',
    ply: 63,
    showPosition: { moveNumber: 32, color: 'white' },
    text: "Welcome back, Sam. You and rook_lifter played a long Caro-Kann, and by move 36 **you were the one on top**. I only want to look at two moments. Let's start here, after **32. Ne4**. Take your time with the whole board. What did that move change?"
  },
  {
    role: 'user',
    ply: 63,
    text: 'It attacks my pawn on f6, I think. I was more focused on my own knight, I wanted to take on g3 with check.'
  },
  {
    role: 'assistant',
    ply: 63,
    text: "It does hit f6, good. Now a different question. Where was that knight a move ago, and what was it doing there?"
  },
  {
    role: 'user',
    ply: 63,
    text: 'On d2. It was defending the rook on c1?'
  },
  {
    role: 'assistant',
    ply: 63,
    text: "Yes. So when it left, what stopped being true about that rook?"
  },
  {
    role: 'user',
    ply: 63,
    text: "Nothing defends it anymore. And my queen on a3 looks straight at it. **32... Qxc1+** wins a rook. I played Nxg3+ instead. Oh."
  },
  {
    role: 'assistant',
    ply: 63,
    text: "Exactly. Nxg3+ was a natural move, checks are tempting. But look at what happened: their last move quietly removed the rook's only defender, and your picture of the board still had a knight on d2. You already know how to spot a free rook. The picture just didn't update. Hold that thought and let's jump ahead to move 37."
  },
  {
    role: 'assistant',
    ply: 73,
    showPosition: { moveNumber: 37, color: 'white' },
    text: "Here your queen went to d2 with check and White took it with **37. Qxd2**. It's your move. Before you tell me what you played, tell me what that capture changed."
  },
  {
    role: 'user',
    ply: 73,
    text: 'They took my queen. Their queen is on d2 now.'
  },
  {
    role: 'assistant',
    ply: 73,
    text: "And look down the d-file from there. What is their queen looking at, and what is your rook looking at?"
  },
  {
    role: 'user',
    ply: 73,
    text: "Their queen attacks my rook on d8. And my rook attacks their queen. I can just take it, **37... Rxd2+**. I played Ng5 to save my knight, didn't I. I forgot I'd been captured."
  },
  {
    role: 'assistant',
    ply: 73,
    text: "You did play **37... Ng5**, and after **38. Qxd8+** the rook was gone and the game turned. Rxd2+ would have kept you clearly ahead.\n\nNotice both moments have the same shape: something changed, and your next move belonged to the old board. That is really common at your level, and it is fixable. It isn't about knowing more chess."
  },
  {
    role: 'assistant',
    ply: 73,
    text: "Here is the one habit I'd like you to try for the next week. After **every** opponent move, before you look for your own idea, ask: **what did that just change?** What does it attack now, and what did it stop defending? Say it in your head, even when the move looks harmless."
  },
  {
    role: 'user',
    ply: 73,
    text: "OK. Can I try that in my next game?"
  },
  {
    role: 'assistant',
    ply: 73,
    text: "Please do, and choose a 10-minute game so you have time to ask the question. Import it afterwards and we'll see whether the question showed up. I'll keep it as your main focus."
  }
];

/** How a persisted assistant/user message body is stored — the AI SDK's parts
 * array, with a show_position call where the coach moves the board. */
export function toStoredContent(entry: TranscriptEntry, index: number): unknown {
  if (entry.role === 'user') return [{ type: 'text', text: entry.text }];
  const parts: unknown[] = [{ type: 'text', text: entry.text }];
  if (entry.showPosition) {
    parts.push({ type: 'tool-call', toolCallId: `demo-show-position-${index}`, toolName: 'show_position', input: entry.showPosition });
  }
  return parts;
}
