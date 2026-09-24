import { toCpWhite, winPctFor, type PlayerColor } from '@freechesscoach/chess-analysis';
import type { EngineEval, EngineLine } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { isBrilliantSound } from './brilliant-soundness.js';

// analysis.test.ts's §5.5 fixture: White's bishop sacs on e6, Black to reply.
const AFTER_FEN = '4k3/3p1p2/4B3/8/8/8/8/4K3 b - - 1 1';

function reply(cp: number | null, mateIn: number | null = null): EngineLine {
  return { moveUci: 'd7e6', moveSan: 'dxe6', pvSan: ['dxe6'], cp, mateIn };
}

function evalAfter(lines: EngineLine[]): EngineEval {
  return { ply: 1, fen: AFTER_FEN, depth: 16, lines };
}

/** The rule the removed engine-backed `checkBrilliantSoundness` applied to
 * `analyzePosition(fenAfter).lines[0]`, kept here as the reference the
 * stored-eval verdicts must match. */
function engineBackedVerdict(lines: EngineLine[], mover: PlayerColor, beforeWin: number): boolean {
  const best = lines[0];
  return best !== undefined && winPctFor(mover, toCpWhite(best)) >= beforeWin - 3;
}

const FIXTURES: { name: string; lines: EngineLine[]; mover: PlayerColor; beforeWin: number; sound: boolean }[] = [
  { name: 'the balanced sacrifice (reply keeps 0cp)', lines: [reply(0)], mover: 'white', beforeWin: 50, sound: true },
  { name: 'a reply that wins material back', lines: [reply(-150)], mover: 'white', beforeWin: 50, sound: false },
  { name: 'a reply just inside the 3% tolerance', lines: [reply(-20)], mover: 'white', beforeWin: 50, sound: true },
  { name: 'the opponent mates', lines: [reply(null, -3)], mover: 'white', beforeWin: 50, sound: false },
  { name: 'the mover still mates', lines: [reply(null, 4)], mover: 'white', beforeWin: 90, sound: true },
  { name: 'a Black sacrifice seen from Black', lines: [reply(-200)], mover: 'black', beforeWin: 60, sound: true },
  { name: 'a terminal position with no reply line', lines: [], mover: 'white', beforeWin: 50, sound: false }
];

describe('isBrilliantSound', () => {
  test.each(FIXTURES)('$name', ({ lines, mover, beforeWin, sound }) => {
    const verdict = isBrilliantSound(evalAfter(lines), mover, beforeWin);

    expect(verdict).toBe(sound);
    expect(verdict).toBe(engineBackedVerdict(lines, mover, beforeWin));
  });

  test('no stored eval fails closed', () => {
    expect(isBrilliantSound(undefined, 'white', 0)).toBe(false);
  });
});
