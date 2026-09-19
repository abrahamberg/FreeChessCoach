import { pick, type Rng } from './rng.js';

const FIRST = ['knight', 'rook', 'pawn', 'bishop', 'castle', 'gambit', 'endgame', 'blitz', 'tempo', 'fork', 'zugzwang', 'sicilian', 'quiet', 'sneaky', 'lazy', 'happy', 'night', 'silver', 'red', 'iron'];
const SECOND = ['wizard', 'rider', 'lifter', 'hunter', 'storm', 'master', 'fan', 'enjoyer', 'pusher', 'whisperer', 'buddy', 'crusher', 'tamer', 'trader', 'dancer', 'jockey', 'monk', 'fox', 'owl', 'wolf'];

/** Plausible online handles for the demo player's opponents — invented, so none
 * of them can belong to a real account. */
export function opponentName(rng: Rng): string {
  const separator = pick(rng, ['', '_', '']);
  const suffix = rng() < 0.55 ? String(Math.floor(rng() * 99)) : '';
  return `${pick(rng, FIRST)}${separator}${pick(rng, SECOND)}${suffix}`;
}
