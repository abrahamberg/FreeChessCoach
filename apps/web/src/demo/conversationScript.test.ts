import { describe, expect, it } from 'vitest';
import { lastShownPly, splitConversation, streamsForTurn } from './conversationScript.js';

const assistant = (id: string, text: string, showPosition?: { moveNumber: number; color: 'white' | 'black' }) => ({
  id,
  role: 'assistant' as const,
  content: [
    { type: 'text', text },
    ...(showPosition ? [{ type: 'tool-call', toolCallId: `t-${id}`, toolName: 'show_position', input: showPosition }] : [])
  ]
});
const user = (id: string, text: string) => ({ id, role: 'user' as const, content: [{ type: 'text', text }] });

describe('splitConversation', () => {
  it('keeps everything before the first student message as history and scripts the rest', () => {
    const { history, turns } = splitConversation([
      assistant('1', 'Welcome.'),
      user('2', 'It attacks f6.'),
      assistant('3', 'Good. What was the knight doing?'),
      user('4', 'Defending the rook.'),
      assistant('5', 'Exactly.')
    ]);
    expect(history.map((message) => message.id)).toEqual(['1']);
    expect(turns).toEqual([
      { userText: 'It attacks f6.', replies: [{ text: 'Good. What was the knight doing?' }] },
      { userText: 'Defending the rook.', replies: [{ text: 'Exactly.' }] }
    ]);
  });

  it('treats the hidden session-start marker as history, not as a scripted turn', () => {
    const { history, turns } = splitConversation([user('1', '[session_start]'), assistant('2', 'Hi.'), user('3', 'Hello')]);
    expect(history.map((message) => message.id)).toEqual(['1', '2']);
    expect(turns).toEqual([{ userText: 'Hello', replies: [] }]);
  });

  it('groups consecutive coach messages into one turn and keeps their board moves', () => {
    const { turns } = splitConversation([
      assistant('1', 'Hi.'),
      user('2', 'Ok'),
      assistant('3', 'First.'),
      assistant('4', 'Now move 37.', { moveNumber: 37, color: 'white' })
    ]);
    expect(turns).toEqual([
      { userText: 'Ok', replies: [{ text: 'First.' }, { text: 'Now move 37.', showPosition: { moveNumber: 37, color: 'white' } }] }
    ]);
  });

  it('returns no turns for a conversation with no student message', () => {
    expect(splitConversation([assistant('1', 'Hi.')]).turns).toEqual([]);
  });
});

describe('streamsForTurn', () => {
  it('puts a whole reply in one stream when the coach never moves the board', () => {
    expect(streamsForTurn({ userText: 'x', replies: [{ text: 'One.' }, { text: 'Two.' }] })).toEqual([
      [{ kind: 'text', text: 'One.\n\nTwo.' }]
    ]);
  });

  it('ends a stream on the show_position call and continues with that reply in the next one', () => {
    const streams = streamsForTurn({
      userText: 'x',
      replies: [{ text: 'First.' }, { text: 'Now move 37.', showPosition: { moveNumber: 37, color: 'white' } }]
    });
    expect(streams).toEqual([
      [
        { kind: 'text', text: 'First.' },
        { kind: 'show_position', moveNumber: 37, color: 'white' }
      ],
      [{ kind: 'text', text: 'Now move 37.' }]
    ]);
  });

  it('emits a lone show_position stream when the very first reply moves the board', () => {
    const streams = streamsForTurn({ userText: 'x', replies: [{ text: 'Look.', showPosition: { moveNumber: 5, color: 'black' } }] });
    expect(streams).toEqual([
      [{ kind: 'show_position', moveNumber: 5, color: 'black' }],
      [{ kind: 'text', text: 'Look.' }]
    ]);
  });
});

describe('lastShownPly', () => {
  it('is the ply of the last position the coach put on the board', () => {
    expect(
      lastShownPly([
        assistant('1', 'a', { moveNumber: 32, color: 'white' }),
        user('2', 'b'),
        assistant('3', 'c', { moveNumber: 37, color: 'black' })
      ])
    ).toBe(74);
  });

  it('is null when the coach has not moved the board yet', () => {
    expect(lastShownPly([assistant('1', 'a')])).toBeNull();
  });
});
