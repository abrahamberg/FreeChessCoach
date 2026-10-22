# One story per move: Game Review and the dossier from the same facts

## Why

Game Review and the course dossier explain the same moves, and today they
are two pipelines that share only `moveIdeas()`:

- **Game Review** (`move-reasons.ts`, called from `classify.ts` when a game
  is analysed) writes about twenty kinds of note straight to text — missed
  mate, missed capture, loose pieces, forks, the better move, the trade, the
  opening principles, the pin or kick, the only move — plus the tactic card
  (`report-tactic-verdicts.ts`), and keeps at most 2 notes and 3 ideas.
- **The dossier** (`course/dossier-node.ts`, `dossier-text.ts`) keeps up to 8
  ideas, the engine's alternatives with their own ideas and line, the best
  move and why, the tempting moves and their refutation, but none of Game
  Review's notes.

Measured on 33 annotated master games, Game Review alone says about a third
of the "why" an annotator gives, the dossier about three quarters. Each says
things the other does not, the same fact is worded twice, and the owner can
only check the dossier through what Game Review shows.

The goal: **the best game review there is**, and a dossier that says nothing
Game Review does not.

## The design

1. **One fact record per move** (`MoveStory`), data only: every review note
   becomes a typed fact (`{ kind: 'loose', piece, square, tier }`, not a
   string), beside the ideas, the tactic card, the best move and why, the
   alternatives and the tempting moves. One builder, used by both.
2. **Words only at the last step**, one renderer per fact kind, with a voice:
   - the player's review: "You leave the pawn on b5 where it can be won"
     on the reader's move, "They …" on the opponent's;
   - the dossier (for the model): "White leaves the pawn on b5 where it can
     be won".
   Same sentence, same facts; only the subject changes.
3. **Game Review shows the whole story**, ranked: the decisive note first,
   the next few, the rest under "more"; on a costly move the better move
   with what it does; the tempting moves and why they fail. Nothing the
   dossier says is missing from it, so Game Review is how the dossier is
   checked.
4. **The facts are stored**, not the sentences: the page renders them
   (`chess-analysis` already runs in the web app), so a wording fix reaches
   every analysed game without analysing it again. Games stored before keep
   their sentences.
5. **One engine pass** serves both (the dedupe investigation).

## Quality gates

- A refactor step changes no sentence: the golden course facts and the
  review audit's corpus stay byte-identical.
- A new kind of sentence reaches players only after the review audit labels
  a sample of it at least 98% correct (`docs/review-audit-plan.md`). The
  dossier's "why X is better" fails today ("moves the knight from b1 to
  c3" says nothing; "leaves the white knight on c4 hanging" is wrong) and is
  fixed first.
- Coverage is measured on what the page shows (`reviewMoveTexts`, which the
  page and the coverage tool both use), Game Review on its own.

## Steps

1. **`buildMoveStory`**: the move-level half of `buildCourseNodeFacts`
   (before/after words, board facts, ideas, the better move and why, the
   alternatives with their ideas and line, the tactic card, the only move)
   becomes a course-free builder; `CourseNodeFacts` is a story plus the
   course's own fields (node, line, creator marks, book siblings, tempting
   moves). The story also carries Game Review's notes, so the dossier says
   them too.
2. **Game Review builds the same story** for every move when a game is
   analysed and stores it with the move; the page renders it with the
   player's renderer, and a game stored before keeps its sentences.
3. **The player's renderer**: ranked, the decisive note first, a few shown
   and the rest under "more"; each new kind of sentence (the better move and
   why, the alternatives, the tempting moves) behind the audit gate.
4. **Typed review notes**: the notes become data one kind at a time, so the
   wording (and the voice) is decided at render time.
5. Re-measure Game Review alone against the annotated games; fix the
   largest missing families ("why not X?", plans, preventions).
