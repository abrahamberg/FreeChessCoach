# Adding a new tactic motif

`classify-tactic-motif.ts`'s `classifyTacticMotif` is a thin loop over
`TACTIC_DETECTORS` (this directory's `registry.ts`) — it does not know the
names of individual tactics. To add one:

1. If the detection algorithm is non-trivial, give it its own file next to
   `tactic-pins.ts`/`tactic-discovered.ts`/etc. (one level up, in `src/`).
   If it's small enough to live inline, skip this step and write it directly
   in step 2's adapter.
2. Create `tactic-detectors/<name>.ts` exporting one `TacticDetector`
   (`{ type, priority, detect(context) }`, see `types.ts`). If your detector
   needs the shared replay/AttackMap (`context.after`/`context.afterAttackMap`
   /`context.destination`), read them from `context: TacticDetectionContext`.
   If it needs a different before/after diff shape, do your own replay from
   `context.fenBefore`/`context.moveSan`/`context.mover` instead (see
   `discovered-attack.ts`/`removes-defender.ts` for that pattern) — either is
   fine, `classify-tactic-motif.ts` doesn't care which.
3. Add your detector to the `TACTIC_DETECTORS` array in `registry.ts`, at the
   priority reflecting how specific/impressive the motif is relative to its
   neighbors (gaps of 10 are left between existing entries for exactly this).
4. Add `'<name>'` to `TACTIC_MOTIF_TYPES` in `packages/shared/src/game-report.ts`.
5. Add one fixture test to `classify-tactic-motif.test.ts` proving the new
   motif's precedence against its neighbors (a position/move that could
   plausibly match more than one motif, asserting yours wins or loses
   correctly), plus a unit test for the detector adapter itself alongside
   the others in this directory.

`checkmate` and `brilliantSacrifice` are **not** registry entries — they're
answerable directly from the raw `TacticMotifContext` (no replay needed), so
they stay as pre-checks at the top of `classifyTacticMotif`. `'other'` is the
post-loop catch-all for any `isTacticalPosition` move matching nothing above.
