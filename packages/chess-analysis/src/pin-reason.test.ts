import { describe, expect, test } from 'vitest';
import { pinReason, withoutCardedPin } from './pin-reason.js';

describe('the pin a quiet move makes (Task 126.2, step one)', () => {
  test('a knight pinned to the queen by a bishop (the owner\'s game, 4.Bg5)', () => {
    expect(pinReason('rnbqkb1r/ppp2ppp/5n2/3pp3/4P3/3P1P2/PPP3PP/RNBQKBNR w KQkq - 0 4', 'Bg5', 'white')).toBe('Pins the knight on f6 to the queen');
  });

  test('a knight pinned to the king (TR-01, 4.Bb5)', () => {
    expect(pinReason('r1bqkbnr/ppp2ppp/2np4/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4', 'Bb5', 'white')).toBe('Pins the knight on c6 to the king');
  });

  test('a knight off the four classic squares (…Bb4 on a knight on d2)', () => {
    expect(pinReason('rnbqk2r/ppp1bppp/4pn2/3p4/2PP4/5NP1/PP1NPP1P/R1BQKB1R b KQkq - 2 5', 'Bb4', 'black')).toBe('Pins the knight on d2 to the king');
  });

  test('silent when the bishop can simply be taken', () => {
    // Bg5 with the h6 pawn already there: hxg5 wins the bishop.
    expect(pinReason('rnbqkb1r/ppp2pp1/5n1p/3pp3/4P3/3P1P2/PPP3PP/RNBQKBNR w KQkq - 0 5', 'Bg5', 'white')).toBeNull();
  });

  test('silent on a pin that was already there', () => {
    // The bishop already stands on g5; a3 changes nothing.
    expect(pinReason('rnbqkb1r/ppp2ppp/5n2/3pp1B1/4P3/3P1P2/PPP3PP/RN1QKBNR w KQkq - 0 4', 'a3', 'white')).toBeNull();
  });

  test('silent on a pin of another shape: step two waits for judges', () => {
    // 16.Rae1 pins the bishop on e7 to the king (TR-10): a rook pin, and a
    // true one. The tactic card names it when the eval turns on it.
    expect(pinReason('rnb1k2r/ppq1bpp1/2p4p/3p4/3P4/2NB1N2/PPPQ1PPP/R4RK1 w kq - 4 16', 'Rae1', 'white')).toBeNull();
  });

  test('silent on a move that cannot be played', () => {
    expect(pinReason('rnbqkb1r/ppp2ppp/5n2/3pp3/4P3/3P1P2/PPP3PP/RNBQKBNR w KQkq - 0 4', 'Bb5', 'white')).toBeNull();
  });

  test('the tactic card for the same pin replaces the note', () => {
    const reasons = ['Pins the knight on f6 to the queen', 'Concedes the centre'];
    expect(withoutCardedPin(reasons, { type: 'pin', found: true })).toEqual(['Concedes the centre']);
    // A pin the mover missed, or a card about something else, is another story.
    expect(withoutCardedPin(reasons, { type: 'pin', found: false })).toEqual(reasons);
    expect(withoutCardedPin(reasons, { type: 'fork', found: true })).toEqual(reasons);
    expect(withoutCardedPin(reasons, undefined)).toEqual(reasons);
  });
});
