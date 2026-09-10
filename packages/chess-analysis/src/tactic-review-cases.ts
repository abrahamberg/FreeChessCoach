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
    previous: { from: 'd7', to: 'd6', wasCapture: false },
    fenBefore: RUY_BB5,
    moveSan: 'Bb5',
    mover: 'white',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: true,
    todayMotif: 'pin',
    todayDetectors: ['pin'],
    todaySentence: "You pinned a piece — their knight on c6 is stuck in front of the king.",
    targetMotif: 'pin',
    targetDetectors: ['pin'],
    targetSentence: "You pinned a piece — their knight on c6 is stuck in front of the king.",
    defect: null,
    note:
      'A real absolute pin that wins no material, so it exercises the positional rung of the gain test. `trappedPiece` used to fire alongside it — the pinned knight has no legal move, which `trappedPieces` read as cornered — and no longer does: a piece with no moves in a position that is not check is pinned, not trapped. Together with TR-05 and TR-10 this is the matched set the pin rework is judged on: keep the two absolute pins, drop the relative pin on a pawn.'
  },
  {
    id: 'TR-02-missing-breaks-pin',
    previous: { from: 'c4', to: 'b5', wasCapture: false },
    fenBefore: AFTER_BB5,
    moveSan: 'Bd7',
    mover: 'black',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: false,
    todayMotif: 'breaksPin',
    todayDetectors: ['breaksPin', 'develops'],
    todaySentence: 'They broke the pin — the knight on c6 is free to move again.',
    targetMotif: 'breaksPin',
    targetDetectors: ['breaksPin', 'develops'],
    targetSentence: 'They broke the pin — the knight on c6 is free to move again.',
    defect: null,
    note:
      'The move that most deserved a note in this game used to get the empty state, because every shipped motif described something done TO the opponent and there was no word for unpinning. `develops` co-fires and is kept: the bishop really does come out doing it, and a second *true* claim is the multi-label view working, not the noise TR-01 and TR-07 were about. The detail carries no possessive: the freed piece belongs to whoever made the move, so "their knight" printed the wrong side\'s word whenever the reader was the mover.'
  },
  {
    id: 'TR-03-phantom-fork-hanging-forker',
    previous: { from: 'e5', to: 'd4', wasCapture: true },
    fenBefore: AFTER_EXD4,
    moveSan: 'Bxc6',
    mover: 'white',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: true,
    todayMotif: null,
    todayDetectors: [],
    todaySentence: null,
    targetMotif: null,
    targetDetectors: [],
    targetSentence: null,
    defect: null,
    note:
      'A trade, not a fork: bxc6 recaptures the bishop immediately. Four detectors fired on this one ordinary exchange and all four are now silent — the fork because the forking piece is itself hanging, the pin because the pinner is, `freePiece` because the exchange on c6 loses material, and `removesDefender` because removing a defender by giving up more than the exposed piece is worth is a sacrifice a static gate cannot judge. `zwischenzug` was the last one to go: taking a knight instead of recapturing a pawn is an in-between move only if it wins something.'
  },
  {
    id: 'TR-04-free-piece-on-a-recapture',
    previous: { from: 'b5', to: 'c6', wasCapture: true },
    fenBefore: AFTER_BXC6,
    moveSan: 'bxc6',
    mover: 'black',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: true,
    todayMotif: null,
    todayDetectors: [],
    todaySentence: null,
    targetMotif: null,
    targetDetectors: [],
    targetSentence: null,
    defect: null,
    note:
      'Recapturing the piece that just captured yours is the most ordinary move in chess, and 97 of 113 recaptures in opening theory carried a label. The detectors are now told the opponent\'s previous move, which is the one thing a FEN cannot carry, so taking back on the square they just took on is no longer a windfall. The defensive claims this move can technically make — it breaks a pin and it escapes a double attack, both by capturing the piece making them — are suppressed for the same reason: that is a capture, and the capture is the card.'
  },
  {
    id: 'TR-05-phantom-pin-on-a-pawn',
    previous: { from: 'b7', to: 'c6', wasCapture: true },
    fenBefore: AFTER_BXC6_RECAPTURED,
    moveSan: 'Qxd4',
    mover: 'white',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: true,
    todayMotif: null,
    todayDetectors: [],
    todaySentence: null,
    targetMotif: null,
    targetDetectors: [],
    targetSentence: null,
    defect: null,
    note:
      'A queen landing on the long diagonal "pins" g7 to the h8 rook. The pawn is guarded as often as it is hit, which is what the relative-pin pressure test now asks, and the recapture is caught by the same previous-move rule as TR-04: they had just captured, and this takes no more than they did.'
  },
  {
    id: 'TR-06-missing-tempo',
    previous: { from: 'd1', to: 'd4', wasCapture: true },
    fenBefore: AFTER_QXD4,
    moveSan: 'c5',
    mover: 'black',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: false,
    todayMotif: 'gainsTempo',
    todayDetectors: ['gainsTempo'],
    todaySentence: "They won a tempo — hits the queen on d4 with a pawn.",
    targetMotif: 'gainsTempo',
    targetDetectors: ['gainsTempo'],
    targetSentence: "They won a tempo — hits the queen on d4 with a pawn.",
    defect: null,
    note:
      'Hitting the queen with a pawn is the clearest tempo gain in the game and there was no motif for it — the same gap chess.com fills with "win a tempo by threatening a queen". It is not a material claim, which is why it needed its own gain kind rather than being squeezed into `fork`.'
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
    todayDetectors: ['discoveredAttack'],
    todaySentence: "You won a queen through a discovered attack — unveils the queen on e7 against the queen on e4.",
    targetMotif: 'discoveredAttack',
    targetDetectors: ['discoveredAttack'],
    targetSentence: "You won a queen through a discovered attack — unveils the queen on e7 against the queen on e4.",
    defect: null,
    note:
      'The most important case in this fixture. The moving piece is deliberately en prise — `see()` on h2 is +330 for White — so the static-safety gate prototyped in docs/tactics-rework.md §2 would have thrown the whole tactic away; verification asks whether the claim pays, never whether the piece is safe, and this survives untouched. `trappedPiece` no longer claims the white queen (the side is in check, so nothing has legal moves), and the sentence now names the queen it wins rather than the square it stands on.'
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
    todayDetectors: ['discoveredAttack'],
    todaySentence: "You won a queen through a brilliant sacrifice — unveils the queen on e7 against the queen on e4.",
    targetMotif: 'brilliantSacrifice',
    targetDetectors: ['discoveredAttack'],
    targetSentence: "You won a queen through a brilliant sacrifice — unveils the queen on e7 against the queen on e4.",
    defect: null,
    note:
      'The same move as TR-07 once the engine has classified it brilliant. The quality flag still wins the headline — that is the right card — but the claims survive alongside it now, so the sentence can say what the sacrifice won. Single-label classification was at its most expensive on the best move in the game.'
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
    todayDetectors: ['pin', 'seizesOpenFile', 'improvesWorstPiece'],
    todaySentence: "You pinned a piece — their bishop on e7 is stuck in front of the king.",
    targetMotif: 'pin',
    targetDetectors: ['pin', 'seizesOpenFile', 'improvesWorstPiece'],
    targetSentence: "You pinned their bishop against the king — it can't move.",
    defect: null,
    note:
      'The textbook pin, and the case any tightening of `pins()` had to keep: a rook swinging to the open file to pin a bishop against the king. It wins nothing, so like TR-01 it survives on the positional rung. `trappedPiece`\'s co-fire is gone; the two claims that remain alongside it are true and were previously unsayable — the rook does take the open file, and it was the least active piece on the board.'
  },
  {
    id: 'TR-09-discovered-check-has-no-name',
    fenBefore: DISCOVERED_CHECK,
    moveSan: 'Nc5+',
    mover: 'white',
    userColor: 'white',
    quality: 'best',
    isTacticalPosition: true,
    todayMotif: 'discoveredCheck',
    todayDetectors: ['discoveredCheck', 'discoveredAttack'],
    todaySentence: "You gave a discovered check — steps aside and the rook on e1 checks the king.",
    targetMotif: 'discoveredCheck',
    targetDetectors: ['discoveredCheck', 'discoveredAttack'],
    targetSentence: "You gave a discovered check — steps aside and the rook on e1 checks the king.",
    defect: null,
    note:
      'A true discovered check — the knight steps aside and the rook, not the knight, gives the check. It used to land as a plain discovered attack whose sentence said the rook "gains a discovered attack on e8" without mentioning that e8 is the king or that the move is forcing. Both claims are kept: it is genuinely both, and the ranker leads with the forcing one.'
  }
];

/** Cases whose shipped behaviour is still wrong. Shrinking this set was the
 * measurable definition of progress on `docs/tactics-rework.md`; the test
 * fails if a case leaves or joins it without this list being updated.
 *
 * Empty since the rework landed. It stays here rather than being deleted
 * because it is the guard, not the record: a detector change that breaks one
 * of these ten cards fails the suite with that card's name, which is the
 * whole reason the fixture exists. */
export const KNOWN_TACTIC_REVIEW_DEFECTS: readonly string[] = [];

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
