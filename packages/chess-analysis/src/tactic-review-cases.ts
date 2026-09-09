import type { TacticReviewCase } from './tactic-review-case.js';
import { isTacticReviewCaseUnfixed } from './tactic-review-case.js';

/**
 * The named, hand-checked Game Review cards behind `docs/tactics-rework.md`
 * §1 — every one reported from the shipped app, replayed here so the rework
 * has a concrete definition of "fixed" instead of a prose description of
 * "better". The shape and the fixed/unfixed rule live in
 * `tactic-review-case.ts`; this file is the data.
 *
 * TR-01…TR-06 come from one real game,
 * `1.e4 e5 2.Nf3 Nc6 3.Bc4 d6 4.Bb5 Bd7 5.d4 exd4 6.Bxc6 bxc6 7.Qxd4 c5`,
 * with the user playing White; their FENs are derived from that move list
 * (not transcribed from a screenshot), so they are exact. TR-07/TR-08 and
 * TR-10 are reported positions whose FENs were read off the board and then
 * verified by replay — each move is legal and does exactly what the report
 * says, which is what makes the reading trustworthy. TR-09 is constructed,
 * and says so.
 */
const RUY_BB5 = 'r1bqkbnr/ppp2ppp/2np4/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
const AFTER_BB5 = 'r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 1 4';
const AFTER_EXD4 = 'r2qkbnr/pppb1ppp/2np4/1B6/3pP3/5N2/PPP2PPP/RNBQK2R w KQkq - 0 6';
const AFTER_BXC6 = 'r2qkbnr/pppb1ppp/2Bp4/8/3pP3/5N2/PPP2PPP/RNBQK2R b KQkq - 0 6';
const AFTER_BXC6_RECAPTURED = 'r2qkbnr/p1pb1ppp/2pp4/8/3pP3/5N2/PPP2PPP/RNBQK2R w KQkq - 0 7';
const AFTER_QXD4 = 'r2qkbnr/p1pb1ppp/2pp4/8/3QP3/5N2/PPP2PPP/RNB1K2R b KQkq - 0 7';

/** Black to move. `Bh2+` steps the bishop off e5 onto a square the king can
 * take, and in doing so opens the e-file so the queen on e7 hits the
 * undefended white queen on e4. After `Kxh2 Qxe4` Black is a queen up for a
 * bishop — the whole reason it is worth a piece. */
const DISCOVERED_SACRIFICE = '2kr3r/pppbqp1p/2n3p1/4b3/4Q3/1BP4P/PP1P1PP1/RNB2RK1 b - - 0 12';

/** White to move. `Rae1` swings the last rook to the open e-file, where it
 * pins the bishop on e7 against the king on e8. The bishop is defended twice
 * (Ke8, Qc7) and attacked once, so nothing is won — this is a bind, and the
 * positional rung of the gain test. chess.com's own card for it makes no
 * material claim either: "That pin is like a Venus flytrap, snapping shut on
 * their bishop!" */
const ROOK_TO_OPEN_FILE = 'rnb1k2r/ppq1bpp1/2p4p/3p4/3P4/2NB1N2/PPPQ1PPP/R4RK1 w kq - 4 16';

/** Constructed, not from a game: the minimum position that isolates a true
 * discovered check. The knight on e4 stands between `Re1` and `Ke8`; `Nc5+`
 * gives no check of its own, so the check comes from the unveiled rook. */
const DISCOVERED_CHECK = '4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1';

export const TACTIC_REVIEW_CASES: readonly TacticReviewCase[] = [
  {
    id: 'TR-01-real-pin-with-noise',
    fenBefore: RUY_BB5,
    moveSan: 'Bb5',
    mover: 'white',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: true,
    todayMotif: 'pin',
    todayDetectors: ['pin', 'trappedPiece'],
    todaySentence: 'Found the pin — pins the knight on c6 against e8.',
    targetMotif: 'pin',
    targetDetectors: ['pin'],
    targetSentence: 'You pinned the knight on c6 against the king.',
    defect: 'noisy-co-fire',
    note:
      'The headline is right — a real absolute pin, winning no material, so it exercises the positional rung of the gain test. But `trappedPiece` fires alongside it: the pinned knight has no legal move, which `trappedPieces` reads as cornered. A defended, pinned knight on its natural square is not a trapped piece. Together with TR-05 and TR-10 this is the matched set the pin rework is judged on: keep the two absolute pins, drop the relative pin on a pawn.'
  },
  {
    id: 'TR-02-missing-breaks-pin',
    fenBefore: AFTER_BB5,
    moveSan: 'Bd7',
    mover: 'black',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: false,
    todayMotif: null,
    todayDetectors: [],
    todaySentence: null,
    targetMotif: 'breaksPin',
    targetDetectors: ['breaksPin'],
    targetSentence: 'They broke the pin on their knight.',
    defect: 'missing',
    note:
      'The move that most deserves a note in this game gets the empty state. Every shipped motif describes something done TO the opponent, so there is no word for unpinning. With isTacticalPosition true the same move degrades to the vacuous "Found the tactic with Bd7." instead — both outcomes are wrong.'
  },
  {
    id: 'TR-03-phantom-fork-hanging-forker',
    fenBefore: AFTER_EXD4,
    moveSan: 'Bxc6',
    mover: 'white',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: true,
    todayMotif: 'fork',
    todayDetectors: ['fork', 'pin', 'removesDefender', 'freePiece'],
    todaySentence: 'Found the fork — bishop on c6 forks b7 and d7.',
    targetMotif: null,
    targetDetectors: [],
    targetSentence: null,
    defect: 'phantom',
    note:
      'A trade, not a fork: bxc6 recaptures the bishop immediately. `forks()` only asks whether a piece attacks two enemy pieces one of which is undefended — nothing checks that the forking piece is itself hanging. Four detectors fire on this one ordinary exchange, so the priority list is picking a winner among four wrong answers.'
  },
  {
    id: 'TR-04-free-piece-on-a-recapture',
    fenBefore: AFTER_BXC6,
    moveSan: 'bxc6',
    mover: 'black',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: true,
    todayMotif: 'freePiece',
    todayDetectors: ['freePiece'],
    todaySentence: 'Found the free piece — captures the undefended bishop on c6.',
    targetMotif: null,
    targetDetectors: [],
    targetSentence: null,
    defect: 'phantom',
    note:
      'Recapturing the piece that just captured yours is the most ordinary move in chess. `captureOpportunities` marks a capture favourable when the captured piece is worth at least the capturer, with no notion of an exchange sequence and no notion of a recapture. `tactic-precision.test.ts` measures the scale of this: 97 of 113 recaptures in opening theory carry a label.'
  },
  {
    id: 'TR-05-phantom-pin-on-a-pawn',
    fenBefore: AFTER_BXC6_RECAPTURED,
    moveSan: 'Qxd4',
    mover: 'white',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: true,
    todayMotif: 'pin',
    todayDetectors: ['pin', 'freePiece'],
    todaySentence: 'Found the pin — pins the pawn on g7 against h8.',
    targetMotif: null,
    targetDetectors: [],
    targetSentence: null,
    defect: 'phantom',
    note:
      'A queen landing on the long diagonal "pins" g7 to the h8 rook. The pawn is not attacked, the pin prevents nothing, and pinning a pawn is almost never a tactic. `pins()` is pure ray geometry with no consequence check.'
  },
  {
    id: 'TR-06-missing-tempo',
    fenBefore: AFTER_QXD4,
    moveSan: 'c5',
    mover: 'black',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: false,
    todayMotif: null,
    todayDetectors: [],
    todaySentence: null,
    targetMotif: 'gainsTempo',
    targetDetectors: ['gainsTempo'],
    targetSentence: 'They won a tempo by threatening the queen.',
    defect: 'missing',
    note:
      'Hitting the queen with a pawn is the clearest tempo gain in the game and there is no motif for it — the same gap chess.com fills with "win a tempo by threatening a queen".'
  },
  {
    id: 'TR-07-discovered-attack-sacrifice',
    fenBefore: DISCOVERED_SACRIFICE,
    moveSan: 'Bh2+',
    mover: 'black',
    userColor: 'black',
    quality: 'best',
    isTacticalPosition: true,
    todayMotif: 'discoveredAttack',
    todayDetectors: ['discoveredAttack', 'trappedPiece'],
    todaySentence: 'Found the discovered attack — queen on e7 gains a discovered attack on e4.',
    targetMotif: 'discoveredAttack',
    targetDetectors: ['discoveredAttack'],
    targetSentence: 'You won the queen through a discovered attack.',
    defect: 'noisy-co-fire',
    note:
      'The most important case in this fixture, for two reasons. First it is a real tactic we get right, and the moving piece is deliberately en prise — `see()` on h2 is +330 for White — so the static-safety gate prototyped in docs/tactics-rework.md §2 would have thrown this whole tactic away. Verification has to be "did the line pay?", never "is the piece safe?". Second, `trappedPiece` fires here claiming "queen on e4 is trapped": White is in check, so every non-king piece has zero legal moves and `trappedPieces` reads them all as cornered. In this corpus a check manufactures a trapped piece 20.7% of the time against a 1.0% baseline on quiet moves. The sentence also names a square rather than the queen it wins.'
  },
  {
    id: 'TR-08-brilliant-shadows-the-mechanism',
    fenBefore: DISCOVERED_SACRIFICE,
    moveSan: 'Bh2+',
    mover: 'black',
    userColor: 'black',
    quality: 'brilliant',
    isTacticalPosition: true,
    todayMotif: 'brilliantSacrifice',
    todayDetectors: ['discoveredAttack', 'trappedPiece'],
    todaySentence: 'Found the brilliant sacrifice with Bh2+.',
    targetMotif: 'brilliantSacrifice',
    targetDetectors: ['discoveredAttack'],
    targetSentence: 'You won the queen through a discovered attack — and gave up a bishop to do it.',
    defect: 'lost-detail',
    note:
      'The same move as TR-07 once the engine has classified it brilliant. `classifyTacticMotif` answers `brilliantSacrifice` from the raw quality flag before the registry runs, so the discovered attack the detector already found is discarded and the card can no longer say what the sacrifice won. Single-label classification is at its most expensive on the best move in the game. Compare chess.com, which keeps the mechanism: "You made your bishop vulnerable, but it was a brilliant sacrifice!"'
  },
  {
    id: 'TR-10-real-pin-on-the-open-file',
    fenBefore: ROOK_TO_OPEN_FILE,
    moveSan: 'Rae1',
    mover: 'white',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: true,
    todayMotif: 'pin',
    todayDetectors: ['pin', 'trappedPiece'],
    todaySentence: 'Found the pin — pins the bishop on e7 against e8.',
    targetMotif: 'pin',
    targetDetectors: ['pin'],
    targetSentence: "You pinned their bishop against the king — it can't move.",
    defect: 'noisy-co-fire',
    note:
      'The textbook pin, and the case any tightening of `pins()` has to keep: a rook swinging to the open file to pin a bishop against the king. It wins nothing — the bishop is defended twice and attacked once — so like TR-01 it only survives a gain test that has a positional rung, and chess.com makes no material claim here either. Two things are still wrong. `trappedPiece` co-fires, because the pinned bishop has zero legal moves; and the sentence says "against e8" rather than "against the king", which is the instructive half.'
  },
  {
    id: 'TR-09-discovered-check-has-no-name',
    fenBefore: DISCOVERED_CHECK,
    moveSan: 'Nc5+',
    mover: 'white',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: true,
    todayMotif: 'discoveredAttack',
    todayDetectors: ['discoveredAttack'],
    todaySentence: 'Found the discovered attack — rook on e1 gains a discovered attack on e8.',
    targetMotif: 'discoveredCheck',
    targetDetectors: ['discoveredCheck', 'discoveredAttack'],
    targetSentence: 'You gave a discovered check.',
    defect: 'mislabelled',
    note:
      'A true discovered check — the knight steps aside and the rook, not the knight, gives the check. There is no `discoveredCheck` motif, so it lands as a plain discovered attack whose detail sentence says the rook "gains a discovered attack on e8" without mentioning that e8 is the king and the move is forcing. `doubleCheck` cannot cover it either: that detector needs two checkers.'
  }
];

/** Cases whose shipped behaviour is still wrong. Shrinking this set is the
 * measurable definition of progress on `docs/tactics-rework.md`; the test
 * fails if a case leaves or joins it without this list being updated. */
export const KNOWN_TACTIC_REVIEW_DEFECTS: readonly string[] = [
  'TR-01-real-pin-with-noise',
  'TR-02-missing-breaks-pin',
  'TR-03-phantom-fork-hanging-forker',
  'TR-04-free-piece-on-a-recapture',
  'TR-05-phantom-pin-on-a-pawn',
  'TR-06-missing-tempo',
  'TR-07-discovered-attack-sacrifice',
  'TR-08-brilliant-shadows-the-mechanism',
  'TR-09-discovered-check-has-no-name',
  'TR-10-real-pin-on-the-open-file'
];

/**
 * Cases that name a tactic today and must still name one afterwards — the
 * guard against reaching `tactic-precision.test.ts`'s ceilings by deleting
 * detectors. Derived rather than hand-listed so a new case can't be omitted
 * by accident; the test also asserts a floor on how many there are, which is
 * the part that actually stops the fixture being neutered.
 */
export function tacticReviewTruePositives(): readonly TacticReviewCase[] {
  return TACTIC_REVIEW_CASES.filter((reviewCase) => reviewCase.todayMotif !== null && reviewCase.targetMotif !== null);
}

/** Cases whose shipped behaviour is still wrong. Shrinking this is the
 * measurable definition of progress on `docs/tactics-rework.md`. */
export function unfixedTacticReviewCases(): readonly TacticReviewCase[] {
  return TACTIC_REVIEW_CASES.filter(isTacticReviewCaseUnfixed);
}
