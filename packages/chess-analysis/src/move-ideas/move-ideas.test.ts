import { Chess, type Move } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { EngineEval } from '@freechesscoach/shared';
import { buildReasons } from '../move-reasons.js';
import { moveIdeas, type MoveIdea } from './index.js';

/** ven Scheve - Teichmann, Berlin 1907: a short Giuoco Piano attack. */
const SCHEVE = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Qe7 5. O-O d6 6. d4 Bb6 7. a4 a6 8. a5 Ba7 9. h3 Nf6 10. dxe5 Nxe5 11. Nxe5 Qxe5 12. Nd2 Bxh3 13. gxh3 Qg3+ 14. Kh1 Qxh3+ 15. Kg1 Ng4 16. Nf3 Qg3+ 17. Kh1 Bxf2';

const history = (pgn: string): Move[] => {
  const chess = new Chess();
  chess.loadPgn(pgn);
  return chess.history({ verbose: true });
};
const GAME = history(SCHEVE);

/** The ideas of the game's move at `ply` (1 = White's first). */
function ideasAt(ply: number): MoveIdea[] {
  const move = GAME[ply - 1];
  if (!move) throw new Error(`no ply ${ply}`);
  return moveIdeas({ fenBefore: move.before, san: move.san, previous: GAME.slice(0, ply - 1) });
}

const kinds = (ideas: readonly MoveIdea[]): string[] => ideas.map((idea) => idea.kind);
const line = (fen: string, cp: number | null, mateIn: number | null, pvSan: string[]): EngineEval => ({ fen, ply: 0, depth: 12, lines: [{ moveSan: pvSan[0] ?? '', moveUci: '', cp, mateIn, pvSan }] });

describe('moveIdeas on a short master game', () => {
  it('says what 1.e4 does for the centre and the bishop', () => {
    const ideas = ideasAt(1);
    expect(ideas).toContainEqual({ kind: 'occupiesCentre', square: 'e4' });
    expect(ideas.find((idea) => idea.kind === 'controlsCentre')).toMatchObject({ squares: ['d5', 'f5'] });
    expect(kinds(ideas)).toContain('opensLine');
  });

  it('sees 3.Bc4 aim at f7, which only the king defends', () => {
    expect(ideasAt(5).find((idea) => idea.kind === 'aimsAt')).toMatchObject({ target: { piece: 'p', square: 'f7' }, onlyKingDefends: true });
  });

  it('names 9.h3 as preventing the pin …Bg4 and loosening the king', () => {
    const ideas = ideasAt(17);
    expect(ideas).toContainEqual({ kind: 'prevents', san: 'Bg4', because: 'pin' });
    expect(kinds(ideas)).toContain('weakensShield');
  });

  it('finds the mate 15…Ng4 threatens, and 16.Nf3 stopping it', () => {
    expect(ideasAt(30)).toContainEqual({ kind: 'threatensMate', line: ['Qh2#'] });
    expect(ideasAt(31)).toContainEqual({ kind: 'stopsMate', line: ['Qh2#'] });
  });

  it('sees the f2-pawn pinned and unable to take the queen on g3', () => {
    expect(ideasAt(26).find((idea) => idea.kind === 'pinnedCannotTake')).toMatchObject({ pinned: { square: 'f2' }, by: { square: 'a7' } });
  });

  it('never prevents a move to the square the move itself took', () => {
    GAME.forEach((move, index) => {
      for (const idea of ideasAt(index + 1)) if (idea.kind === 'prevents') expect(new Chess(move.after).move(idea.san)?.to).not.toBe(move.to);
    });
  });
});

describe('moveIdeas precision', () => {
  it('does not call a king that may not take a mating queen pinned', () => {
    const fen = 'r1bn1rk1/ppq1b3/4pnNQ/2pp2N1/3P4/2P5/PP3PPP/R1B2RK1 w - - 0 18';
    expect(kinds(moveIdeas({ fenBefore: fen, san: 'Qh8#', previous: [] }))).not.toContain('pinnedCannotTake');
  });

  it('calls a piece given up a sacrifice only when the position is not lost anyway', () => {
    const fen = 'rnb2k2/ppp2p2/1b1p3r/1B1Pp3/4P3/2P3Pq/PP2QP2/RN3RK1 w - - 0 20';
    const after = new Chess(fen).move('Qh5').after;
    const lost = { fenBefore: fen, san: 'Qh5', previous: [], evalBefore: line(fen, null, -3, ['Qh5']), evalAfter: line(after, null, -2, ['Rxh5']) };
    expect(kinds(moveIdeas(lost))).not.toContain('sacrifices');
    const sound = { ...lost, evalBefore: line(fen, 50, null, ['Qh5']), evalAfter: line(after, 40, null, ['Rxh5']) };
    expect(kinds(moveIdeas(sound))).toContain('sacrifices');
  });

  it('states the material only once the exchange is over', () => {
    const fen = '1r4k1/r4ppp/pqR1b3/R2p4/1P1Q4/P3PPP1/7P/5BK1 b - - 0 27';
    const after = new Chess(fen).move('Qxc6').after;
    const balance = (reply: string): string[] => kinds(moveIdeas({ fenBefore: fen, san: 'Qxc6', previous: [], evalAfter: line(after, 0, null, [reply]) }));
    expect(balance('Qxa7')).not.toContain('materialBalance');
    expect(balance('Kf2')).toContain('materialBalance');
  });
});

describe('Game Review notes', () => {
  it('follows a book move\'s theory line with what the move does', () => {
    const start = new Chess().fen();
    const reasons = buildReasons({ mover: 'white', fenBefore: start, fenAfter: new Chess(start).move('e4').after, moveSan: 'e4', evalBefore: line(start, 30, null, ['e4']), isBookMove: true, openingName: "King's Pawn Game", quality: 'book' });
    expect(reasons[0]).toMatch(/^Theory/);
    expect(reasons.length).toBeGreaterThan(1);
  });
});
