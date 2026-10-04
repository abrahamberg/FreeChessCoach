# Review notes: ideas built, dropped and not built yet

Kept by the `review-why-pass` skill (`.claude/skills/review-why-pass/SKILL.md`).
Each pass over a real game gives explanations for moves the review left
unexplained or explained generically. Rules that recur and can be computed
from the board are built (`packages/chess-analysis/src/piece-coordination.ts`,
`principle-reasons.ts`); the rest wait here with their evidence, so the next
game can add examples and push a row over the line.

**How to use this file.** After a pass, add the game and ply to an existing
row (raise its count) or add a row. Build a row when it has about three
examples from different games *and* a rule that compares two resulting
positions. Move it to "Built" with the commit. Never delete a dropped idea:
the reason it was dropped stops the next session building it again.

Evidence so far: pass 1 (36 uncommented moves) and pass 2 (30 moves where the
engine's best differed), both on one game, `d690d041` (Black reader, 500 vs 507,
2026-10-04). One game is thin: a count of 1 below means "seen once".

## Built

| Rule | Says | Where | Notes |
|---|---|---|---|
| Cuts off own piece | "f4 cuts off the bishop on d6, from 9 squares to 6; g5 keeps it open" | `blocksOwnPieceText` | costly moves, loss ≤ 150 cp, best not a capture |
| Piles on a defended piece | "g5 was better: it adds a third attacker to the knight on d5…" | `pilesOnText` | cheapest attacker ≤ target value |
| Connects the rooks | "Nbd2 was better: it connects the rooks" | `connectsRooksText` | castling excluded |
| Supports an advanced piece | "supports the knight on e5 with the pawn" | `supportsAdvancedPieceText` | no hit yet in 5 games |
| Opens an own piece (best move) | "Opens the bishop on f1, from 0 squares to 5" | `opensOwnPieceText` | pawn moves off their start rank only |
| Frees the opponent's piece | "exf4 takes the pawn that shut in Black's bishop on d6: Bxf4 frees it…" | `freesEnemyPieceText` | looks at the engine's replies, not only the first |
| What the best move does | "Rhe8 was better: it puts the rook on the e-file, which has no pawns" | `bestDoesText` | last fallback, loss ≤ 300 cp; no text when both moves take the same piece |
| Pin | "…it pins the knight on c6 to the king" | `pinNote` (uses `pinReason`) | replaces "attacks the knight" |
| Plain development / rook onto a pawn-free file | "Develops the bishop" | `plainDevelopmentText`, `openFileRookText` | fine moves only |
| Leaves the king open to checks | "dxe4 leaves the king facing 4 possible checks; Nd2 allows only 2" | `allowsChecksText` | ≥3 checks and ≥2 more than best |
| Gives up a pawn's hold on the centre | "e4 gives up a pawn's hold on d4 (1 pawn guards it, 0 after); Nf6 keeps it" | `givesUpCentreText` | opening/middlegame only (move ≤ 20), best not a capture or king move |
| Trapped piece leads a tie | "…win a queen through a trapped piece" | `rank-tactic-claims.ts` `prizeMismatch` | claim whose prize matches the line's win leads |

## Dropped

| Idea | Why |
|---|---|
| "Defends X a second time, though nothing attacks it" | 12 hits in 5 games, all noise ("Qc2 defends the pawn on c3"). The real fault was elsewhere. |
| Pawn-shield count to explain a recapture (fxg3 vs hxg3) | Shield pawns counted equal for both captures; see the open row below for what might work. |

## Built, but silent on the plies that motivated them (checked 2026-10-04)

The rules in "Built" were measured on other positions, not on these. On game
`d690` the real pipeline says nothing of the kind on:

| Rule | Motivating plies | What the app says instead | Why |
|---|---|---|---|
| Leaves the king open to checks | 46 (…Kxd8), 48 (…Qf6), 60 (…c4) | "Recaptures the knight on d8" / the cut-off note / nothing | 46 is labelled "good", and the rule only runs on inaccuracy or worse; 48's cut-off note wins first; 60's loss is too big and its mate too long to count |
| Gives up a pawn's hold on the centre | 12 (…Be6 vs g6), 24 (…f4) | "Develops the bishop" / the cut-off note | 12 is "good"; 24 is taken by the cut-off note first |
| Pin and a second attacker on a pinned piece | 56–57 (Re1 vs the pinned e8 bishop) | "Leaves the pawn on c5 undefended" / "Puts the rook on the e-file" | the pile-on rule skips a pinned target nothing else defends; 57 is a best move with only the open-file note |
| Open file taken first | 27 (a4 vs Rfe1) | nothing | 27 is a "good" move: no comparison is made |

Decide per row whether to let a rule run on "good" moves with a gap of 30 cp or
more, and whether one of two true notes should win. Do not count these rows
as covered.

## Not built yet

| Idea | Seen | Count | Why not built / what would change it |
|---|---|---|---|
| Recapture that opens the file next to the king (21.fxg3 vs hxg3: f2 leaves, f-file opens; Qxh7 −1.32 vs ok) | d690 ply 41 | 1 | Gap only 0.19 at depth 22, medium confidence. Candidate rule: after the move, a file adjacent to the king has none of the mover's pawns and an enemy rook can reach it next move. Needs 2 more examples. |
| Bishop-pair ownership (Bxf6 gives White's side the pair; Bxc6 gives Black two bishops) | d690 plies 5, 21 | 2 | The existing trade note says "Trades the bishop for the knight…"; add "and gives up the bishop pair" when one side ends with two bishops and the other has none. Rule is easy; wait for a third case and check it is not noise in opening trades. |
| Own piece in front of an own pawn that needs it (14…Nc6 stops …c6 while d5 needs backing) | d690 ply 14 | 1 | Gap 0.2–0.3 at depth 22, low confidence. |
| Bad bishop behind own pawns (…Be6 between d5 and f5) | d690 ply 12 | 1 | Played move was "good"; only a comparison against a pawn move (g6) explains it. Overlaps "cuts off". |
| Development / pawn-storm tempo (undeveloped minors, moves a storm pawn still needs to attack a piece) | d690 plies 15, 18, 19, 23 | 4 | Three of four gaps under 20 cp at depth 22: likely no concrete difference. Do not build from depth-12 gaps this small. |
| Attacking a piece that is not pinned and can retreat for free (Bb5 after the king left e8) | d690 ply 19 | 1 | Needs a "can the attacked piece move away at no cost" test (SEE of its flight squares). |
| Opening development comments are thin ("Develops the bishop") against "aims at h2 and clears f8 so you can castle" | d690 plies 8, 9, 11, 12, 14 | 5 | Cheap extra facts: the bishop's newly attacked squares near the enemy king; which back-rank square it clears. Wait for the owner's view on text length. |
| "Rfe1 was better" on a *good* move (a4 left the e-file; O-O vs Nbd2) | d690 plies 13, 27 | 2 | Good moves are not "improvable", so no comparison is made. `strongerCandidatesText` needs two. Owner's call: say it on a good move when the gap is ≥ 30 cp? |
| "Before the opponent's rook gets there" on the open-file note | d690 plies 27, 28 | 2 | Cheap: add when an enemy rook can reach the file next move. |
| Knight outpost not named (39…Nc5 on d4's square, no pawn can chase it) | d690 ply 39 | 1 | `outpostText` did not fire although the outpost holds; find which of its conditions failed. Bug-shaped, check first. |
| Mating technique moves: queen trade when well ahead, rook on the 7th, king boxed to the edge (plies 49, 53, 61, 62, 66, 67) | d690 | 6 | Tactical layer and mate counts, not positional. Mate counts past about 7 are the owner's call (`review-engine-depth-and-mate-counts`). |
| A blunder with no note at all (60…c4, mate in 6 follows) | d690 ply 60 | 1 | The mate is too long to count. A count-free "lets White force mate" is the owner's call. |
| Clutter on blunders: "Leaves the pawn on h7 undefended" beside a lost queen | d690 ply 42 | 1 | Minor notes beside the real cause. Owner's call whether to drop them on a blunder. |
| Fork / damage control ("Rf7 saves one rook; g6 first blocks the queen's diagonal") | d690 ply 44 | 1 | One example. |

## Engine-depth caveat

The stored evals are depth 12. Agents re-checked at depth 22: of 30 "best"
moves 4 were not best, and several gaps were under 20 cp. A positional note on
a gap that small is a guess. The app cannot search deeper, so the rules here
stay behind a loss gate and the notes stay silent when the gap is small.
