import type { TacticMotifType } from '@freechesscoach/shared';

/**
 * The named, hand-checked Game Review cases behind `docs/tactics-rework.md`
 * — every one reported from the shipped app, replayed here as a fixture so
 * the rework has a concrete definition of "fixed" instead of a prose
 * description of "better".
 *
 * All positions come from one real game,
 * `1.e4 e5 2.Nf3 Nc6 3.Bc4 d6 4.Bb5 Bd7 5.d4 exd4 6.Bxc6 bxc6 7.Qxd4 c5`,
 * with the user playing White. FENs are derived from that move list (not
 * transcribed from a screenshot), so they are exact.
 *
 * `todayMotif`/`todaySentence` are what the pipeline produces right now;
 * `tactic-review-cases.test.ts` asserts them, so this file cannot drift from
 * the code. `targetMotif` is what each case must produce once
 * `docs/tactics-rework.md` phases 0–D land — the two disagree for every
 * defect, and that disagreement is the debt list the test enforces.
 * `targetSentence` records the intended prose for reference only; the exact
 * wording is a product decision and is deliberately not asserted.
 */
export interface TacticReviewCase {
  /** Stable id — quote it in commit messages and the plan doc. */
  id: string;
  fenBefore: string;
  moveSan: string;
  mover: 'white' | 'black';
  /** Whose review this is. The card is written to this side's player, so it
   * decides "You" vs "They" — see docs/tactics-rework.md §3 rule 3. */
  userColor: 'white' | 'black';
  /** `isTacticalPosition` as the shipped pipeline computed it here. It only
   * changes the outcome for a move no detector matches: `true` yields the
   * `'other'` catch-all, `false` yields no card at all. */
  isTacticalPosition: boolean;
  todayMotif: TacticMotifType | null;
  /** `null` when no card is shown — the review UI's "Nothing to flag" state. */
  todaySentence: string | null;
  /** Motifs that do not exist yet arrive with phase D of the rework. */
  targetMotif: TacticMotifType | 'breaksPin' | 'gainsTempo' | null;
  targetSentence: string | null;
  note: string;
}

const RUY_BB5 = 'r1bqkbnr/ppp2ppp/2np4/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
const AFTER_BB5 = 'r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 1 4';
const AFTER_EXD4 = 'r2qkbnr/pppb1ppp/2np4/1B6/3pP3/5N2/PPP2PPP/RNBQK2R w KQkq - 0 6';
const AFTER_BXC6 = 'r2qkbnr/pppb1ppp/2Bp4/8/3pP3/5N2/PPP2PPP/RNBQK2R b KQkq - 0 6';
const AFTER_BXC6_RECAPTURED = 'r2qkbnr/p1pb1ppp/2pp4/8/3pP3/5N2/PPP2PPP/RNBQK2R w KQkq - 0 7';
const AFTER_QXD4 = 'r2qkbnr/p1pb1ppp/2pp4/8/3QP3/5N2/PPP2PPP/RNB1K2R b KQkq - 0 7';

export const TACTIC_REVIEW_CASES: readonly TacticReviewCase[] = [
  {
    id: 'TR-01-true-positive-pin',
    fenBefore: RUY_BB5,
    moveSan: 'Bb5',
    mover: 'white',
    userColor: 'white',
    isTacticalPosition: true,
    todayMotif: 'pin',
    todaySentence: 'Found the pin — pins the knight on c6 against e8.',
    targetMotif: 'pin',
    targetSentence: 'You pinned the knight on c6 against the king.',
    note:
      'The one case that is already right, and the reason the rework cannot just tighten every detector until nothing fires: this is a real absolute pin. It wins no material, so it exercises the positional rung of the gain test — a claim kept for a structural reason rather than a material one.'
  },
  {
    id: 'TR-02-missing-breaks-pin',
    fenBefore: AFTER_BB5,
    moveSan: 'Bd7',
    mover: 'black',
    userColor: 'white',
    isTacticalPosition: false,
    todayMotif: null,
    todaySentence: null,
    targetMotif: 'breaksPin',
    targetSentence: 'They broke the pin on their knight.',
    note:
      'The move that most deserves a note in this game gets the empty state. Every shipped motif describes something done TO the opponent, so there is no word for unpinning. With isTacticalPosition true the same move degrades to the vacuous "Found the tactic with Bd7." instead — both outcomes are wrong.'
  },
  {
    id: 'TR-03-phantom-fork-hanging-forker',
    fenBefore: AFTER_EXD4,
    moveSan: 'Bxc6',
    mover: 'white',
    userColor: 'white',
    isTacticalPosition: true,
    todayMotif: 'fork',
    todaySentence: 'Found the fork — bishop on c6 forks b7 and d7.',
    targetMotif: null,
    targetSentence: null,
    note:
      'A trade, not a fork: bxc6 recaptures the bishop immediately. `forks()` only asks whether a piece attacks two enemy pieces one of which is undefended — nothing checks that the forking piece is itself hanging.'
  },
  {
    id: 'TR-04-free-piece-on-a-recapture',
    fenBefore: AFTER_BXC6,
    moveSan: 'bxc6',
    mover: 'black',
    userColor: 'white',
    isTacticalPosition: true,
    todayMotif: 'freePiece',
    todaySentence: 'Found the free piece — captures the undefended bishop on c6.',
    targetMotif: null,
    targetSentence: null,
    note:
      'Recapturing the piece that just captured yours is the most ordinary move in chess. `captureOpportunities` marks a capture favourable when the captured piece is worth at least the capturer, with no notion of an exchange sequence and no notion of a recapture.'
  },
  {
    id: 'TR-05-phantom-pin-on-a-pawn',
    fenBefore: AFTER_BXC6_RECAPTURED,
    moveSan: 'Qxd4',
    mover: 'white',
    userColor: 'white',
    isTacticalPosition: true,
    todayMotif: 'pin',
    todaySentence: 'Found the pin — pins the pawn on g7 against h8.',
    targetMotif: null,
    targetSentence: null,
    note:
      'A queen landing on the long diagonal "pins" g7 to the h8 rook. The pawn is not attacked, the pin prevents nothing, and pinning a pawn is almost never a tactic. `pins()` is pure ray geometry with no consequence check.'
  },
  {
    id: 'TR-06-missing-tempo',
    fenBefore: AFTER_QXD4,
    moveSan: 'c5',
    mover: 'black',
    userColor: 'white',
    isTacticalPosition: false,
    todayMotif: null,
    todaySentence: null,
    targetMotif: 'gainsTempo',
    targetSentence: 'They won a tempo by threatening the queen.',
    note:
      'Hitting the queen with a pawn is the clearest tempo gain in the game and there is no motif for it — the same gap chess.com fills with "win a tempo by threatening a queen".'
  }
];

/** Cases whose shipped behaviour is still wrong. Shrinking this set is the
 * measurable definition of progress on `docs/tactics-rework.md`; the test
 * fails if a case leaves or joins it without this list being updated. */
export const KNOWN_TACTIC_REVIEW_DEFECTS: readonly string[] = [
  'TR-02-missing-breaks-pin',
  'TR-03-phantom-fork-hanging-forker',
  'TR-04-free-piece-on-a-recapture',
  'TR-05-phantom-pin-on-a-pawn',
  'TR-06-missing-tempo'
];
