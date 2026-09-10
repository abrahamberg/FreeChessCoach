# Adding a new tactic motif

`classify-tactic-motif.ts`'s `classifyTacticClaims` runs four layers over one
move — propose, verify, rank, and pick a headline (`docs/tactics-rework.md`
§5) — and does not know the names of individual tactics. A detector is the
propose half.

## What a detector is

A `TacticDetector` (see `types.ts`) returns **claims, not a verdict**:

```ts
detect(context: TacticDetectionContext): TacticClaim[]
```

Each claim carries the concrete squares that make it checkable — its actor,
what it hits, the piece it expects to win, what that is worth, and the arrows
the card draws (`tactic-claim.ts`). Two rules follow from that and are the
whole reason the shape exists:

- **Over-propose.** `verify-tactic-claims.ts` decides which claims survive,
  and `verify-tactic-line.ts` decides again against the engine's own
  continuation when the caller has one. A detector that hedges hides a real
  tactic from the verifier; one that over-proposes only costs it a test. The
  gates a detector *should* apply are the ones about its own mechanism — a
  fork needs a forking piece, not a safe one.
- **Be move-scoped.** A claim's actor has to be a piece this move put to
  work. `trappedPieceDetector` used to fire on any trapped piece anywhere on
  the board, related to the move or not, which is what made it co-fire on
  every real pin.

## Steps

1. If the detection algorithm is non-trivial, give it its own file next to
   `tactic-pins.ts`/`tactic-discovered.ts`/etc. (one level up, in `src/`).
   If it's small enough to live inline, skip this step and write it directly
   in step 2's adapter.
2. Create `tactic-detectors/<name>.ts` exporting one `TacticDetector`. Read
   whatever you need from `context: TacticDetectionContext` — the replay
   (`after`/`afterAttackMap`/`destination`/`move`), the null-move position
   (`beforeNullMove`, for "what could they have done?"), or the opponent's
   previous move (`previous`, which is what tells a recapture from a
   windfall). Anything more than one detector wants goes through
   `context.facts` (`facts.ts`): pins, forks, trapped pieces, the opponent's
   forced replies and SEE per square are each computed at most once per move,
   and forty-odd detectors run over every ply of every game.
3. Add your detector to the `TACTIC_DETECTORS` array in `registry.ts`.
   `priority` is now only a tie-breaker of last resort — the headline is
   chosen by what a claim wins (`rank-tactic-claims.ts`) — so place it by how
   specific the motif is relative to its neighbours and don't tune it to win
   a card.
4. Add `'<name>'` to `TACTIC_MOTIF_TYPES` in
   `packages/shared/src/tactic-motif.ts`, along with its label, its family
   (which decides the narrator's verb), and its three grammatical forms in
   `tactic-motif-phrases.ts`.
5. Add a unit test for the detector alongside the others in this directory:
   one position where it fires and one where it doesn't, asserting the
   claim's squares rather than just its type. If the motif is rare enough
   that the 360-puzzle corpus doesn't contain it, add it to
   `registry-coverage.test.ts`'s `RARE_IN_PUZZLES` with a pointer to that
   fixture — otherwise that test fails, which is what stops a detector whose
   gates can never all be true from shipping.
6. Run `tactic-precision.test.ts` and
   `lichess-puzzle-validation.test.ts`. The three precision ceilings only ever
   go down and the recall floors only ever go up; a new detector that moves
   either the wrong way needs its gates tightened, not the threshold moved.

`checkmate` and `brilliantSacrifice` are **not** registry entries — they're
answerable directly from the move's own quality (no replay needed), so they
stay as pre-checks in `classifyTacticClaims`. Their claims are kept alongside
them, so a brilliant sacrifice can still say what it won. There is no
`'other'` catch-all any more: a card that says a tactic happened without
naming it is what §3's acceptance bar rules out.
