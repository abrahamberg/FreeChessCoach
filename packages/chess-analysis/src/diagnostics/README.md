# Adding a diagnostic detector

This directory mirrors `../tactic-detectors/` — a priority-ordered registry,
a shared per-ply context, one file per detector, a `types.ts` contract — but
answers a different question. `tactic-detectors` classifies *what tactic a
move was* (one answer per move, first match wins). `diagnostics` asks *what
opportunity a ply presented and whether the student took it*, for as many of
the 410 `docs/diagnose.md` codes as have a detector — a ply can present
several independent opportunities at once, so the registry here does not
stop at the first match. Precedence among the `DiagnosticDetector`s that fire
on the same ply is resolved later, by Task 54.3, not by this registry.

## The five-step flow

1. Pick the code from `packages/shared/src/diagnosis/` (the 410-code
   catalog) and read its row plus its family's section of `docs/diagnose.md`
   (the plan's per-task **Read:** line names the exact section — never read
   the spec end-to-end for this).
2. Create `detectors/<code>-<direction>.ts` (e.g. `detectors/ms-01-d.ts`)
   exporting one `DiagnosticDetector` (`{ code, direction, priority, detect
   (ctx) }`, see `types.ts`). `detect` reads whatever it needs off
   `PlyDiagnosticContext` (`context.ts`) — `features`, `checksCapturesThreats`
   /`opponentChecksCapturesThreats`, `tacticOpportunity`/`tacticPrevention`,
   `alternatives`, `bestLinePvSan`, `moveTime` — and returns one
   `DiagnosticObservation` when this ply was a genuine §4.4 opportunity
   (theme objectively present, findable, material, position not already
   diagnostically meaningless), or `null` when it wasn't. Do not filter out
   opportunities the student handled correctly — `failed: false` still
   counts toward `O` in Phase 55's `E`/`O` metrics; only the ply not being an
   opportunity at all justifies returning `null`.
3. Add the detector to the `DIAGNOSTIC_DETECTORS` array in `registry.ts`, at
   the priority reflecting §I.3 causal precedence relative to its neighbors
   (gaps of 10 are left between existing entries for exactly this — a more
   proximate cause gets a lower number).
4. Flip that code's `detectability` from `'unsupported'`/`'dialogue'`/
   `'probe'` to `'detector'` in its `packages/shared/src/diagnosis/families/
   *.ts` entry — this is the one place the catalog and the detector set are
   kept honest against each other.
5. Add three fixture tests alongside the detector: one proving the
   opportunity fires (`failed: true`, a hand-built FEN where the theme is
   present and the student missed it), one proving it does not fire when the
   student handled it or the theme was absent, and one proving precedence
   against its closest causal neighbor (the case Task 54.3 will actually
   consume — a position where two detectors could both plausibly fire,
   asserting each still reports independently at this layer; the *choice*
   between them is not this layer's job).

## What lives where

- `types.ts` — the `DiagnosticDetector`/`DiagnosticObservation` contract.
  No detector-specific logic.
- `context.ts` — `PlyDiagnosticContext`, built once per ply from the stored
  `ClassifiedMoveDto` (Task 50 guarantees `fenBefore`/`fenAfter` on every
  freshly classified move) plus the opponent's CCT scan on `fenAfter`,
  computed fresh since nothing stores it. No engine calls here or in any
  detector — everything on the context is either read off the stored move or
  derived from a FEN the move already carries.
- `registry.ts` — `DIAGNOSTIC_DETECTORS`, priority-sorted. The only file that
  imports every detector; detectors never import each other or this file.
- `cct-opportunities.ts` (Task 53.2) — the shared primitive every `MS-*`
  detector is built on: which profitable captures/checks were available and
  unplayed, which opponent checks/captures/threats existed after the move.
- `motif-to-code.ts` (Task 53.5) — maps a `TacticMotifType` (plus its
  detector detail, e.g. `ForkHit.piece`) onto the precise `TA-*` code, since
  one motif type can span several codes (`fork` → `TA-07`..`TA-10` by
  forking piece).
- `detectors/` — one file per code+direction, per the flow above.
