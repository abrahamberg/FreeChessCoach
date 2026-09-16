import { TACTIC_MOTIF_LABELS, type TacticBaselineNoteDto } from '@freechesscoach/shared';
import { TACTIC_MOTIF_PHRASES, motifWithArticle } from './tactic-motif-phrases.js';

/**
 * The game-level card's two sentences: what stood out, and what to do about
 * it.
 *
 * `docs/tactics-rework.md` §3 rule 6 — the note is relative to the player
 * ("unusual *for you*"), its tone tracks how far out of line the game was,
 * and it closes with something to actually do, which is what chess.com pairs
 * every game-level card with and the natural handoff into a coach session or
 * a puzzle assignment.
 */

export function tacticBaselineHeadline(note: TacticBaselineNoteDto): string {
  const motif = motifWithArticle(note.motif);
  const plural = TACTIC_MOTIF_LABELS[note.motif].toLowerCase();

  if (note.tone === 'strength') {
    return `You found ${countPhrase(note)} ${plural} this game — better than your usual ${percent(note.baselineRate)}.`;
  }
  if (note.kind === 'allowed') {
    return note.tone === 'habit'
      ? `You allowed ${countPhrase(note)} ${plural} this game, and that has been the pattern across your last ${note.baselineGames} games.`
      : `You allowed ${motif} this game, which is unusual for you — you normally stop ${percent(1 - note.baselineRate)} of them.`;
  }
  return note.tone === 'habit'
    ? `You missed ${countPhrase(note)} ${plural} this game, and that has been the pattern across your last ${note.baselineGames} games.`
    : `You missed ${motif} this game, which is unusual for you — you normally find ${percent(1 - note.baselineRate)} of them.${softener(note)}`;
}

/** What to go and do. Deliberately one concrete instruction rather than a
 * summary: a game-level card that only restates the number is the thing
 * being replaced. */
export function tacticBaselineDrill(note: TacticBaselineNoteDto): string {
  const phrases = TACTIC_MOTIF_PHRASES[note.motif];
  if (note.kind === 'allowed') return `Next game, before each move, ask what ${phrases.noun} they have.`;
  if (note.tone === 'strength') return `Keep doing it — look for one more chance to ${phrases.toDo} each game.`;
  return `Next game, hunt for one thing: a chance to ${phrases.toDo}.`;
}

/** "one" / "two of three" — the size of the story, in the words a card
 * would use. */
function countPhrase(note: TacticBaselineNoteDto): string {
  const hits = Math.round(note.gameRate * note.gameChances);
  if (note.gameChances === 1) return 'one';
  if (hits === note.gameChances) return `all ${note.gameChances}`;
  return `${hits} of ${note.gameChances}`;
}

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** A single lapse against a good record is a note, not a weakness, and the
 * copy should say so rather than scoring it. */
function softener(note: TacticBaselineNoteDto): string {
  return note.gameChances === 1 ? ' No big deal.' : '';
}
