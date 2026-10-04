import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { CONFIG } from './config.js';

/** Notes that say something small beside a move that lost a piece or allowed mate. */
const PAWN_NOTE = /^Leaves the pawn on [a-h][1-8]|keeps the pawn on [a-h][1-8] safe|takes the pawn out of danger on /;
const POSITIONAL_NOTE = /^(Creates a passed pawn|Develops the|Puts the rook on|Opens the|Pins the knight|Takes the \w+ on [a-h][1-8], which nothing defended)/;
const LOOSE_PIECE_NOTE = /^Leaves the (?!pawn)(\w+) on ([a-h][1-8]) where it can be won/;

/** The fault is decisive: a mistake, blunder or miss whose allowed tactic is a
 * mate or a piece (3 pawns or more). */
export function hasDecisiveNote(move: Pick<ClassifiedMoveDto, 'quality' | 'tacticAllowed'>): boolean {
  if (move.quality !== 'mistake' && move.quality !== 'blunder' && move.quality !== 'miss') return false;
  const gain = move.tacticAllowed?.gain;
  return gain !== undefined && (gain.kind === 'mate' || (gain.kind === 'material' && gain.pawns >= CONFIG.decisiveNotes.minPawns));
}

/**
 * Next to a decisive note, the small ones are clutter: a lost queen read
 * "Leaves the pawn on h7 undefended / Rde8 keeps h7 safe" first. Dropped: pawn
 * notes, positional notes, and a loose-piece note that says the same piece
 * the decisive sentence names. Kept: the decisive sentence, "stopped guarding"
 * and "keeps the piece safe" notes about the decisive piece, the summary.
 */
export function withoutClutterBesideDecisive(plain: readonly string[], decisive: readonly string[]): string[] {
  const said = decisive.join(' ');
  return plain.filter((note) => {
    if (PAWN_NOTE.test(note) || POSITIONAL_NOTE.test(note)) return false;
    const loose = LOOSE_PIECE_NOTE.exec(note);
    return !(loose && said.includes(` on ${loose[2]}`));
  });
}
