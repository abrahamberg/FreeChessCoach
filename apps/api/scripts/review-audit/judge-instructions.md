# Judge a batch of review sentences

You are checking sentences that FreeChessCoach shows a chess player about
their game (surface `review`, Game Review's note card) or hands a model that
writes a course (surface `dossier`). For each sentence below, decide whether
it is true and fair on the board shown, then write one JSON line per
sentence to:

    {{LABEL_FILE}}

Line format (one per sentence, nothing else in the file):

    {"id":"<the 10-char id>","verdict":"correct|wrong|misleading|unclear","tag":"<short-kebab-tag>","note":"<one sentence: what is wrong, with the square or move>"}

`tag` names the kind of mistake, reused across sentences so errors group:
`absent-piece` (names a piece that is not there), `hypothetical-line` (talks
about a position after moves the sentence does not show), `not-winnable`
(says material can be won and it cannot), `wrong-material`, `wrong-motif`
(the tactic named is not what happens), `not-a-threat`, `wrong-voice`
(You/They mixed up), `wrong-move`, `irrelevant` (true but beside the point
of the move), `missing-point` (true, but hides the real reason, e.g. "the
only move; everything else loses the queen"). Use `ok` for correct ones.
Invent a new tag only when none fits.

## How to judge

Never judge from the diagram alone. Every claim you accept or reject must be
checked with the probe, which uses chess.js and Stockfish:

    npm run review:audit -w apps/api -- probe --fen "<fen>" [--moves "Nxe5 Rxd3"] [--depth 18]

It prints the board after the moves, every piece's attackers and defenders,
what each capture wins over the full exchange, the material, and the
engine's top lines. Run it on the `before` or `after` FEN from the packet.
Use it to test the line a sentence implies (the reply it names, the capture
it says wins material, the fork, the threat that was stopped).

The packet shows, per position: both boards (uppercase White, lowercase
Black), the FENs, the engine's lines before and after the move (evaluations
from White's view: +1.00 is White a pawn better, #3 White mates in 3, #-3
Black mates in 3), and each sentence with what the code checks found. "You"
is the reader, the player whose review it is; the packet says whether the
reader or the opponent made the move.

A `CODE CHECK FAILED` line is evidence, not a verdict. Confirm it with the
probe; if the check is wrong (the sentence is in fact true), label the
sentence `correct` and say in the note which check misfired and why: that
is a bug in the audit and it matters.

## Verdicts

- `correct`: every fact in it is true on the board the reader sees (before
  or after the move, or along a move or line the sentence itself names), and
  it is about what actually matters in this move. Generous on wording, strict
  on facts.
- `wrong`: any fact is false. A piece named on a square it is not on. A move
  that is not legal. Material "won" that the exchange does not win (a piece
  defended as many times as it is attacked, by cheaper pieces, is not won).
  A threat that was never there, or would not have worked. A mate that is
  not forced. The wrong side named.
- `misleading`: each fact is technically true but a reader would come away
  wrong: it describes a position several moves ahead without showing the
  moves; it praises a move for a side-effect while the real reason (the only
  move, a mate threat, saving the queen) goes unsaid; it calls a routine
  trade a win; it names a tactic the engine's line does not actually play.
- `unclear`: you cannot tell even with the probe. Say why. Use it rarely.

Dossier rows are read by a model, not a person: judge the fact itself
("attacks the bishop on f4" must be true after the move; "best instead: Nc3;
after Nc3 Nf6 Bg5, material is level" must be legal and the material right
at that line's end). "tempting" rows claim a move looks good and fails:
check that the refutation really refutes it.

## Useful, not only true (the owner's calibration, 2026-10-01)

The owner read ten labels and marked true sentences down for being clutter
or for missing the point. A true sentence is `misleading` when:

- **The move played is checkmate** and the sentence is about anything else:
  another move ("Rxd2+: Black is much better"), the pawn structure, files.
  The mate is the whole description. Tag `irrelevant`.
- **The game is decided** (a forced mate, or five pawns up) and the sentence
  is a small positional note: a half-open file, an isolated pawn, a pawn
  majority, where a king stands. Only the winning side's passed pawns are
  worth a row. Tag `irrelevant`.
- **The feature plays no part in what happens next**, in a balanced game
  too: "black has a passed pawn on h6" with queens and minor pieces deciding
  the game. Keep `correct` only for a feature a coach would mention when
  explaining this position. Tag `irrelevant`.
- **A mate is "forced" with no number**: "They forced mate." where the probe
  shows mate in 5. Tag `imprecise`. (A move that is itself mate needs none.)
- **A mistake or blunder note does not say what is lost.** It has to name
  the piece that hangs or the exchange with its count ("b5 is attacked three
  times and defended twice: a pawn goes"). "Win a knight" or "can be won"
  when the exchange nets a pawn stays `wrong`, `not-winnable`.

Judge the note of a move as a whole as well. The packet lists every sentence
of the move. If the biggest fact about the move (the only winning move was
missed, a queen was left hanging, a forced mate was given up) is in none of
its `[review]` sentences, label the first `[review]` sentence `misleading`,
`missing-point`, and say what is unsaid. If another sentence of the same
move says it, this one is not at fault.

The packet shows the move's quality badge. Excellent, best or great on a
move that gives up a forced mate is the wrong badge, even if the game stays
won: put `badge: <what it should not be, why>` in the note of that move's
missed-mate sentence (the badge is not a sentence yet).

A `CODE CHECK FAILED` for `nothing-after-mate`, `decided-trivia` or
`mate-count` is one of these rules applied by code; it is only an
`audit-bug` when the rule's condition is false (the move is not mate, the
game is not decided, the sentence does give the number).

## Examples from the owner's own game (all wrong)

- 12.Bxc5 "You stopped them forcing mate through a back-rank tactic — rook on
  d1 checks the king on g1, boxed in on the back rank." The rook is on d8,
  and …Rd1+ is answered by Rxd1: there was never a mate. `absent-piece`.
- 13…Bd3 "Leaves the bishop on d3 where it can be won." The rook on d8
  defends d3; Nxd3 Rxd3 is an even trade. `not-winnable`.
- 25.Qxc7 "You stopped them winning a queen through a discovered attack —
  unveils the rook on d1 against the queen on d6." No rook on d1, no queen
  on d6. The real point: Qxc7 was the only move that keeps the queen.
  `absent-piece`.

Be terse. Work through every sentence in the packet; do not skip any. When
done, reply with only the number of sentences labelled and how many were
not `correct`.
