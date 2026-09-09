import type { TacticMotifType } from '@freechesscoach/shared';

/**
 * The three grammatical forms a motif is used in, written out per motif
 * rather than conjugated at runtime — English past tenses are irregular
 * often enough ("gave", "took", "threw in") that deriving them from one
 * stored form produces exactly the kind of almost-right copy
 * `docs/tactics-rework.md` §3 is about.
 *
 * - `noun` — the subordinate clause in the main template, "…through a
 *   **fork**". Singular and lowercase so it reads mid-sentence, unlike
 *   `TACTIC_MOTIF_LABELS` (plural, capitalised — the dashboard's column
 *   headers).
 * - `did` — what the mover did, for a motif whose payoff isn't material and
 *   so has no "win a rook" to lead with: "You **pinned a piece**."
 * - `toDo` — the same in the infinitive, for the missed voice: "You missed a
 *   chance to **pin a piece**."
 */
export interface TacticMotifPhrases {
  noun: string;
  did: string;
  toDo: string;
}

export const TACTIC_MOTIF_PHRASES: Record<TacticMotifType, TacticMotifPhrases> = {
  checkmate: { noun: 'checkmate', did: 'delivered checkmate', toDo: 'deliver checkmate' },
  brilliantSacrifice: { noun: 'brilliant sacrifice', did: 'found a brilliant sacrifice', toDo: 'find a brilliant sacrifice' },
  doubleCheck: { noun: 'double check', did: 'gave a double check', toDo: 'give a double check' },
  fork: { noun: 'fork', did: 'landed a fork', toDo: 'land a fork' },
  skewer: { noun: 'skewer', did: 'set up a skewer', toDo: 'set up a skewer' },
  pin: { noun: 'pin', did: 'pinned a piece', toDo: 'pin a piece' },
  discoveredAttack: { noun: 'discovered attack', did: 'uncovered an attack', toDo: 'uncover an attack' },
  overloadedDefender: { noun: 'overloaded defender', did: 'overloaded a defender', toDo: 'overload a defender' },
  removesDefender: { noun: 'defender-removing tactic', did: 'removed a defender', toDo: 'remove a defender' },
  weakBackRank: { noun: 'back-rank tactic', did: 'hit the weak back rank', toDo: 'hit the weak back rank' },
  trappedPiece: { noun: 'trapped piece', did: 'trapped a piece', toDo: 'trap a piece' },
  freePiece: { noun: 'free piece', did: 'took a free piece', toDo: 'take a free piece' },
  other: { noun: 'tactic', did: 'found a tactic', toDo: 'find a tactic' },
  discoveredCheck: { noun: 'discovered check', did: 'gave a discovered check', toDo: 'give a discovered check' },
  deflection: { noun: 'deflection', did: 'deflected a defender', toDo: 'deflect a defender' },
  decoy: { noun: 'decoy', did: 'decoyed a piece onto a bad square', toDo: 'decoy a piece onto a bad square' },
  interference: { noun: 'interference', did: 'cut a defender off', toDo: 'cut a defender off' },
  clearance: { noun: 'clearance', did: 'cleared the line', toDo: 'clear the line' },
  xRayAttack: { noun: 'X-ray attack', did: 'set up an X-ray', toDo: 'set up an X-ray' },
  zwischenzug: { noun: 'in-between move', did: 'threw in an in-between move', toDo: 'throw in an in-between move' },
  desperado: { noun: 'desperado', did: 'sold a doomed piece as dearly as possible', toDo: 'sell a doomed piece as dearly as possible' },
  windmill: { noun: 'windmill', did: 'started a windmill', toDo: 'start a windmill' },
  smotheredMate: { noun: 'smothered mate', did: 'delivered a smothered mate', toDo: 'deliver a smothered mate' },
  matingNet: { noun: 'mating net', did: 'closed a mating net', toDo: 'close a mating net' },
  promotionTactic: { noun: 'promotion', did: 'pushed a pawn through', toDo: 'push a pawn through' },
  underPromotion: { noun: 'underpromotion', did: 'underpromoted', toDo: 'underpromote' },
  pawnBreakthrough: { noun: 'pawn breakthrough', did: 'broke through with a pawn', toDo: 'break through with a pawn' },
  attractionSac: { noun: 'attraction sacrifice', did: 'dragged the king out', toDo: 'drag the king out' },
  breaksPin: { noun: 'unpin', did: 'broke the pin', toDo: 'break the pin' },
  escapesFork: { noun: 'escape', did: 'escaped the fork', toDo: 'escape the fork' },
  defendsHangingPiece: { noun: 'save', did: 'saved a hanging piece', toDo: 'save a hanging piece' },
  blocksThreat: { noun: 'block', did: 'blocked the threat', toDo: 'block the threat' },
  counterAttack: { noun: 'counter-attack', did: 'hit back instead of retreating', toDo: 'hit back instead of retreating' },
  removesTarget: { noun: 'retreat', did: 'moved the target out of reach', toDo: 'move the target out of reach' },
  perpetualCheck: { noun: 'perpetual check', did: 'took the perpetual', toDo: 'take the perpetual' },
  stalemateResource: { noun: 'stalemate resource', did: 'found the stalemate', toDo: 'find the stalemate' },
  simplifiesToDraw: { noun: 'simplification', did: 'traded down towards a draw', toDo: 'trade down towards a draw' },
  prophylaxis: { noun: 'prophylactic move', did: 'stopped the idea before it started', toDo: 'stop the idea before it starts' },
  gainsTempo: { noun: 'tempo gain', did: 'won a tempo', toDo: 'win a tempo' },
  develops: { noun: 'developing move', did: 'developed a piece', toDo: 'develop a piece' },
  improvesWorstPiece: { noun: 'repositioning', did: 'improved the worst piece', toDo: 'improve the worst piece' },
  seizesOpenFile: { noun: 'file grab', did: 'took the open file', toDo: 'take the open file' },
  outpost: { noun: 'outpost', did: 'planted a piece on an outpost', toDo: 'plant a piece on an outpost' },
  spaceGain: { noun: 'space gain', did: 'gained space', toDo: 'gain space' },
  preparesBreak: { noun: 'pawn break', did: 'prepared a pawn break', toDo: 'prepare a pawn break' },
  favourableTrade: { noun: 'trade', did: 'made a favourable trade', toDo: 'make a favourable trade' },
  kingSafety: { noun: 'king-safety move', did: 'tucked the king away', toDo: 'tuck the king away' }
};

export function articleFor(noun: string): string {
  return /^[aeiou]/i.test(noun) ? 'an' : 'a';
}

/** "a fork" / "an in-between move" — the subordinate clause's noun with its
 * article, since the article depends on the word and the word depends on the
 * motif. */
export function motifWithArticle(type: TacticMotifType): string {
  const noun = TACTIC_MOTIF_PHRASES[type].noun;
  return `${articleFor(noun)} ${noun}`;
}
