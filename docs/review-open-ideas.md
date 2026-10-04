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
| Takes a piece nothing defended | "Takes the pawn on e4, which nothing defended" | `freeCaptureText` | best/good captures with no other note; 7 hits on 4 games, all true; recaptures keep their "Recaptures" note |
| Trapped piece leads a tie | "…win a queen through a trapped piece" | `rank-tactic-claims.ts` `prizeMismatch` | claim whose prize matches the line's win leads |

## Pass 3: four more games, 8 agents (2026-10-04)

Games `0a1f`, `34a1`, `9b05`, `d971` (dev DB), 118 entries (83 not-best, 35
best-with-a-gap), `min-loss 45`, `good-gap 60`. Joined with what the pipeline says
today on the same plies:

| | entries |
|---|---|
| agent found a concrete difference | 96 (tactical 83, positional 8, mixed 3, rest) |
| ...app has text / silent / only a generic note | 61 / 21 / 14 |
| no concrete difference (gap gone at depth 20+, or both lines mate) | 22 (19%) |

"App has text" is not "right text": it was not checked entry by entry.

Recurring in the silent and thin ones (count = entries, games):

| Idea | Count | Status |
|---|---|---|
| A good capture of an undefended piece | 7 in 4 games | **built** (`freeCaptureText`) |
| Safe checks / king flight squares after a move (Qd1+ / Qc1+ / Nd2+ chains; Kb2 leaves 0 safe checks, Kb3 1) | 7 in 1 game (d971 77–89) | not built: one game, and the count of immediate checks is not the agent's count (it follows the chain). A real rule would need "checks the opponent has that the king cannot answer with a capture", over two plies. |
| Overloaded guard (the d8 rook guards a8 and must recapture on d3) | 3 in 1 game (34a1 40–42) | the tactic layer has an overloaded-defender detector; it was silent here. Look at why before building. |
| Piece attacked more often than defended, x-ray included (b4 leaves the knight on d3 at 2 v 1; Rb1 leaves d2 at 2 v 1) | 4 in 2 games (34a1 33, 9b05 27/33/35) | partly built (`leftLooseReason`). Gap: x-ray rooks behind the first attacker, and "good"-labelled moves. |
| Guard of a promotion square (a8 against the a-pawn) | 4 in 1 game (34a1 40–43) | one game |
| Knight check that forks king and queen (…Ne2+) | 5 in 1 game (0a1f 23–28) | the fork detector exists; texts were present |
| Development tempo and castling (Nf6 covers g4/h5 and lets Black castle) | 4 in 1 game (0a1f 15–20) | note exists ("develops the knight and attacks…"); the agent's extra detail (blocks castling, covers the mate square) is not said |
| Promotion piece choice (queen reaches the long diagonal, rook does not) | 1 | one example |

**Depth and mates (again):** 34a1 45–49 had depth-12 gaps of 221 to 2793 cp where
both lines were forced mates: shallow search missing mates. The decided-game rule
already treats mate-versus-mate as no fault; those entries confirm it matters.
In already-won positions (+5 and more) the cp gap is squeezed (a clean loss of a
bishop shows 74 cp): judge by material there.

**Method lessons** (also in the skill): eight agents probing at once gave one wrong
result (a probe of a position outside its batch) and two agents killed each
other's jobs with `pkill`. Run at most three agents at a time, each with its own
scratch folder, and tell them to probe one position at a time.

## Decisions and what is done (2026-10-04, `docs/review-owner-decisions-2026-10-04.md`)

| Decision | Status |
|---|---|
| Labels stay at the stored depth; a deep check removes "X was better" notes that depth 18 does not confirm | **built**, off by default: `REVIEW_DEEP_CHECK=1` (`deep-comparison.ts`). On 14 stored games it re-searches 0-14 plies a game at about 1.2 s each, and refutes the plies the agents marked "no concrete difference" (d690 17, 23, 25, 29, 14). Not yet judged on a larger sample, so it is not on. |
| No "X was better" on a *good* move | **done** (comparison removed) |
| Drop minor notes beside a decisive fault | **done**, `CONFIG.decisiveNotes.enabled` (`decisive-notes.ts`) |
| Mate counts: no change | nothing to do |
| Kick notes: keep all | nothing to do |
| "The only move that holds": once per run of 3+ identical notes | **not built**: golden opposition drill loses 5 expected lines, so the golden file changes in the same commit |
| Probe prints the depth reached; check prod's depth | probe **done**; prod's depth **open** (needs the private kube values) |
| Two golden trap plies allow mate in 1-2 with no sentence (5…Bxd1, 3…Nf6) | **open**, re-run with `show` |

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
| Leaves the king open to checks | 46 (…Kxd8), 48 (…Qf6), 60 (…c4) | "Recaptures the knight on d8" / the cut-off note / nothing | The rule counts the checks available right after the move: Kxd8 leaves White 1 (Re8+), Qxd8 1 (Qf5+), so it cannot see the agent's "4 vs 2", which counted deeper. 46's gap is also under the "good" cut; 60's loss is too big and its mate too long to count. Checks now come before the cut-off note, and a "good" move with a gap of 30 cp or more gets the comparison, but neither reaches these plies. |
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

**Correction (2026-10-04, from a proxy review; each point checked in code).** The
engine server stops every search after `DEFAULT_TIMEOUT_MS = 5000`
(`services/engine/src/uci.ts`), and the response's `depth` was the depth *asked
for*, not reached. So every "depth 20/22/24" probe number in this file and in the
agents' answers is really about depth 19-21 on a busy position. The probe now
prints the depth reached ("asked for 24; stopped by the engine's time limit",
reached 21) and `PositionAnalysis.reachedDepth` carries it; stored game evals
still record the asked-for depth. The conclusions stand (deeper search changes
gaps and labels) but the numbers are softer than they read. **Open:** the helm
chart (`deploy/helm/freechesscoach/values.yaml`) sets the engine's default depth
to 18 with a 3 s cutoff, so prod may not be at depth 12 at all and may be cutting
depth-18 searches short; check the private kube values or prod's `engine_evals`.


**Measured 2026-10-04 (probe, depth 20, against the stored depth 12):** 46…Kxd8
vs Qxd8: 38 cp stored (labelled "good"), 51 cp at depth 20, about 67 cp at depth
22. 48…Qf6 vs Qf8: 99 cp stored, 129 cp at depth 20. Deeper search makes the
gaps larger, so some "good" moves would be inaccuracies and the comparison rules
would get more to explain. The app's depth is the owner's call
(`review-engine-depth-and-mate-counts`); nothing was changed.


The stored evals are depth 12. Agents re-checked at depth 22: of 30 "best"
moves 4 were not best, and several gaps were under 20 cp. A positional note on
a gap that small is a guess. The app cannot search deeper, so the rules here
stay behind a loss gate and the notes stay silent when the gap is small.
