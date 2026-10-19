import { Chess, type Color, type Square } from 'chess.js';
import { looseAmong, loosePieces, type LoosePiece } from '../board-facts/loose-pieces.js';
import { pins, type PinHit } from '../tactic-pins.js';

/** A few hundred positions' answers: one move's detectors ask the same
 * position the same question several times (a move's "after" is the next
 * move's "before"). Pure functions of the position, so caching is safe. */
const LIMIT = 512;

function memoised<T>(compute: (key: string) => T): (key: string) => T {
  const cache = new Map<string, T>();
  return (key) => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const value = compute(key);
    if (cache.size >= LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(key, value);
    return value;
  };
}

const looseByKey = memoised((key) => {
  const [owner, ...fen] = key.split(' ');
  return loosePieces(fen.join(' '), owner as Color);
});
const pinsByFen = memoised((fen) => pins(new Chess(fen)));

export const looseOf = (fen: string, owner: Color): LoosePiece[] => looseByKey(`${owner} ${fen}`);
/** `looseOf` for a few squares only: no memo, it is cheap. */
export const looseAt = (fen: string, owner: Color, squares: readonly Square[]): LoosePiece[] => (squares.length ? looseAmong(fen, owner, squares) : []);
export const pinsOf = (fen: string): PinHit[] => pinsByFen(fen);
