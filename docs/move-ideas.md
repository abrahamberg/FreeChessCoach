# Move ideas: the "why" of a move

Written 2026-10-20. `packages/chess-analysis/src/move-ideas/` says why a move
was played, as checked data (`MoveIdea`): what it threatens and stops, what
it does for development, the centre, the lines, the king and the pawns, and
what it prepares. Game Review's notes and the course dossier both show them.

## Where the list came from

A study of annotated master games: every annotator's note was tagged with
the ideas it gives (3,748 tags in 20 families), and the detectors are the
ideas that recur and can be checked on the board. The annotations, the tags
and the measuring scripts are kept locally, outside the repository.

## The ideas

One detector file per family; `renderMoveIdea` (`render.ts`) is the only place
they become words.

| File | Ideas |
|---|---|
| `development.ts` | develops (to the natural square), castles, clears the way to castle, a piece moved again while others wait, the queen out early, a piece in front of the centre pawn, a pawn on the knight's square, development count |
| `centre.ts` | a pawn in the centre, centre squares controlled, pressure on an enemy centre pawn, support of an own centre pawn, a break against the centre, a piece centralised, the centre given up |
| `lines.ts` | own line opened or shut, enemy line opened, long diagonal and fianchetto, aims at the king or a pawn only the king defends, queen-bishop battery, rook on an open or half-open file, rook to the centre, rooks connected or doubled, file opened by a pawn capture, seventh rank |
| `threats.ts` | mate threatened (in one, or two starting with a check), material threatened (`loosePieces`), piling on, a pinned man that cannot take, a pin made, kept or suffered, a pawn kick, an enemy piece dominated |
| `defence.ts` | mate stopped, a piece saved (moved, defended, attacker taken, blocked), a man defended, an enemy move prevented (check, pin, attack, pawn break, invasion), a pin broken |
| `king.ts` | the shield loosened (holes no pawn can cover again), the enemy shield broken, a king's defender removed, a piece joining the attack, the knight on f3/f6 guarding the king, flight squares given or taken, castling stopped or given up, the king active in the ending |
| `structure.ts` | outposts and holes, blockade, pawn storm, passed pawns, doubled and isolated pawns made or forced, space, a pawn fixed, a pawn majority |
| `material.ts`, `trades.ts` | sacrifices and gambits the engine approves, the material after an exchange, trades when ahead, recapture toward the centre, the bishop pair |
| `plans.ts` | the engine's next move the move made possible, a pawn advance it supports, a fianchetto it opens, an outpost a knight heads for |

Precision rules found by checking 134 sampled ideas by hand (about 92%
right before the fixes): nothing on a mate; no prevention on a capture or a
check; no domination while in check; a sacrifice only when the position is
not lost anyway; the material only once the exchange is over; no pin of a
king; no shield or castling talk in the ending. Endgame studies start at
move 1, so the move number alone does not say "opening": with two pieces
or fewer a side there is no development, and with four pawns or fewer too
no centre control (a piece centralised still counts); no outpost against a
side with no pawns; a pawn pushed up an isolated file is not a new
isolated pawn, and a passed pawn's push is not a pawn storm.

## Where they show

- **Course dossier** (`course/dossier-node.ts`): an `ideas:` row per move
  (`CONFIG.courses.ideasShown`), and each of the engine's other moves with
  its own ideas (scope `does`) and the line after it: "Bd6 (the bishop on d6
  blocks the pawn on d7): Black is worse, after …".
- **Game Review** (`move-reason-ideas.ts`, from `buildReasons`): a book move
  says its theory line and then up to `CONFIG.moveReasons.maxIdeas` ideas; a
  fine move's ideas replace the pin, kick and principle notes they cover; a
  costly move keeps its fault notes and adds what it did wrong (shield
  loosened, piece shut in), and on an inaccuracy or a miss a mate it
  threatened or stopped.

## How good, measured

Share of the annotators' tagged ideas the app also says on the same move (plans
and preventions must name the same move or square; a "why not X?" must name
X with a reason). The rules were built on games 1–25; 26–30 were studied
after a first measure; 31–33 were never studied.

| | before | after |
|---|---|---|
| games 1–25 | 29.6% | 76.0% |
| games 26–30 | 30.3% | 70.6% |
| games 31–33 (untouched) | 27.4% | 71.1% |
| all 33 | 29.4% | 74.3% |
| all 33, without "why not X?" | – | 79.5% |

Cost: about 2.4 ms a move (memoised; `loosePieces` and `lineChanges` only
where pressure changed). The move generation, exchanges, mate searches and
slider reach behind it run on `fast-board/`, a plain board with chess.js's
rules but no SAN or history: chess.js plays every move it generates to
write its SAN, which was most of the cost (about 20 ms a move before).
Perft at the standard positions pins its rules (`fast-board.test.ts`).

## Not built yet

- **"Why not X?" for moves outside the engine's three lines.** 101 of the
  192 such alternatives the annotators discuss are quiet moves of the same piece
  ("3…Bd6 blocks the d-pawn"). It needs a search per alternative; the
  course's tempting pass is where it would go.
- **Plans longer than one move** (the Colle's Bd3, Nbd2, Qe2, e4) and
  restraint of a pawn from afar (Rfd1 against …c5 through the d-file).
- **Mates three moves deep** (Qf4, then Qh6 and Qg7#): the board search
  stops at two.
- **An annotator's "only move"** where the engine disagrees: the app follows
  the engine.
