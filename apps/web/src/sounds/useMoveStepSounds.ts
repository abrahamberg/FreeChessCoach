import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { useCallback, useEffect, useRef } from 'react';
import { playBoardSound } from './board-sounds.js';
import { moveSound } from './move-sounds.js';

export interface MoveStepSoundsInput {
  /** The board's ply (0 = the start); a step of one forward sounds that move. */
  ply: number;
  sanMoves: readonly string[];
  /** The student's colour: their moves knock, the other side's knock softer. */
  learnerSide: 'white' | 'black';
  /** Analyzed moves (review, a coaching session on a game): bad and great
   * for either side. Omitted for a live game, which never plays them. */
  classifiedMoves?: readonly ClassifiedMoveDto[];
  /** Nothing while exploring a sandbox line. */
  disabled?: boolean;
  /** The position `ply` 0 is, when not the game's start (a practice
   * position): who moves first. */
  startFen?: string;
  /** A step of up to this many moves sounds them in turn (practice plays the
   * student's move and the reply together). */
  maxStep?: number;
}

/** Between two moves sounded in one step. */
const BETWEEN_MS = 250;

/** Board sounds as a game is stepped through or played (docs/plan.md
 * Phase 88): a step forward of one move (or up to `maxStep`, in turn)
 * sounds; opening, going back and jumping do not. The student's own drop sounds at once through
 * `soundOwnMove`, and is not sounded again when the server confirms it. */
export function useMoveStepSounds({
  ply,
  sanMoves,
  learnerSide,
  classifiedMoves,
  disabled = false,
  startFen,
  maxStep = 1
}: MoveStepSoundsInput): { soundOwnMove: (san: string) => void } {
  const previous = useRef(ply);
  /** The ply already sounded on the student's drop. */
  const sounded = useRef<number | null>(null);

  useEffect(() => {
    const from = previous.current;
    previous.current = ply;
    const step = ply - from;
    if (disabled || step < 1 || step > maxStep) return;
    const blackFirst = startFen?.split(' ')[1] === 'b';
    for (let at = from + 1; at <= ply; at++) {
      if (sounded.current === at) {
        sounded.current = null;
        continue;
      }
      const san = sanMoves[at - 1];
      if (!san) continue;
      const move = classifiedMoves?.find((each) => each.ply === at);
      const before = classifiedMoves?.find((each) => each.ply === at - 1);
      const sound = moveSound({
        san,
        mover: (at + (blackFirst ? 1 : 0)) % 2 === 1 ? 'white' : 'black',
        learnerSide,
        quality: move?.quality,
        cpBefore: at === 1 ? 0 : before?.evalAfterCp,
        cpAfter: move?.evalAfterCp
      });
      const delay = (at - from - 1) * BETWEEN_MS;
      if (delay) window.setTimeout(() => playBoardSound(sound), delay);
      else playBoardSound(sound);
    }
  }, [ply]);

  const soundOwnMove = useCallback(
    (san: string) => {
      sounded.current = sanMoves.length + 1;
      playBoardSound(moveSound({ san, mover: learnerSide, learnerSide }));
    },
    [sanMoves.length, learnerSide]
  );
  return { soundOwnMove };
}
