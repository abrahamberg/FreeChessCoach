# Tactical review rework — investigation and plan

Status: **design only, nothing implemented.** This document records why Game
Review's tactic sentences are wrong, what was measured, and the architecture
that fixes it. It is a companion to `docs/algorith.md` §7.2 (tactics score) and
`packages/chess-analysis/src/tactic-detectors/README.md` (how a detector is
added today).

Measured against `packages/chess-analysis` at commit `96dc8fc`.

---

## 1. Symptoms, and the exact code behind each

All examples come from one real game:
`1.e4 e5 2.Nf3 Nc6 3.Bc4 d6 4.Bb5 Bd7 5.d4 exd4 6.Bxc6 bxc6 7.Qxd4 c5`.
Every sentence below reproduces on current `main` by running
`classifyTacticMotif` + `tacticHitDetail` over those plies.

| Ply | Move | Printed | Correct reading | Cause |
| --- | --- | --- | --- | --- |
| 11 | `6.Bxc6` | "Found the fork — bishop on c6 forks b7 and d7." | A trade. The bishop is recaptured next move. | `tactics.ts` → `forks()` never checks that the forking piece is itself safe. |
| 12 | `6…bxc6` | "Defused the opponent's fork — bishop on c6 forks b7 and d7." + "Missed a pin — pins the pawn on e4" | A recapture. | The phantom fork from ply 11 is re-reported by the prevention path; the "pin" is a bishop ray onto a pawn. |
| 13 | `7.Qxd4` | "pins the pawn on g7 against h8" | Recaptures, but the queen is loose on d4. | `tactic-pins.ts` → `pins()` is pure ray geometry with no consequence check. |
| 8 | `4…Bd7` | "Nothing to flag — a solid, natural move." | **Breaks the pin** on the c6 knight. | No defensive motif exists in the vocabulary. |
| 14 | `7…c5` | "Nothing to flag — a solid, natural move." | Hits the queen with tempo. | No positional/tempo motif exists in the vocabulary. |

One screenshot item — "pawn on e5 is trapped" — was already fixed by `96dc8fc`
(`trappedPieces()` no longer counts pawns). Production is one release behind on
that; everything else above is live on `main`.

## 2. Measurements

Two corpora already in the repo, no new data needed.

### Noise — `data/openings.tsv`, 1,200 main lines, 14,012 plies

Opening theory is by construction *not* tactics. Today:

```
any motif assigned   3,139 / 14,012   22.4%
  freePiece            1,314           9.4%   (almost all recaptures)
  pin                    695           5.0%
  discoveredAttack       327           2.3%
  skewer                 326           2.3%
  fork                   305           2.2%
  trappedPiece           139           1.0%
  overloaded/removes      32           0.2%
```

Representative generated sentences: *"Bg2 skewers the knight on c6, exposing the
pawn on b7"* (a fianchetto), *"Bc4 pins the pawn on f7 against g8"* (the Italian
bishop), *"cxd4 captures the undefended pawn on d4"* (a Smith-Morra recapture).

### Recall — `data/lichess-puzzle-motifs.csv`, 360 puzzles

Label produced on solver plies, 40 puzzles (≈80 plies) per Lichess theme:

| Lichess theme | our top label | 2nd | 3rd | correct |
| --- | --- | --- | --- | --- |
| fork | fork 48 | freePiece 20 | removesDefender 3 | 48/80 |
| doubleCheck | doubleCheck 40 | freePiece 14 | fork 11 | 40/80 |
| discoveredAttack | discoveredAttack 33 | fork 21 | freePiece 13 | 33/80 |
| skewer | skewer 33 | freePiece 25 | fork 10 | 33/80 |
| hangingPiece | freePiece 29 | fork 14 | other 12 | 29/80 |
| pin | **fork 24** | pin 24 | freePiece 15 | 24/80 |
| trappedPiece | **freePiece 22** | trappedPiece 18 | fork 12 | 18/80 |
| capturingDefender | **fork 27** | freePiece 23 | removesDefender 12 | 12/80 |

`forkDetector` sits at priority 10 and `classifyTacticMotif` returns the first
match, so a loose fork definition eats everything below it.

### How much is precedence rather than detection

Puzzles where the correct motif is found, first-match vs. *any* detector firing
(n = 40 each):

| theme | first match | any detector | recovered |
| --- | --- | --- | --- |
| capturingDefender | 11 | 31 | +20 |
| trappedPiece | 18 | 30 | +12 |
| hangingPiece | 29 | 40 | +11 |
| discoveredAttack | 32 | 40 | +8 |
| skewer | 33 | 40 | +7 |
| pin | 24 | 29 | +5 |

The detectors mostly *do* see the motif. Single-label first-match throws it away.

### Two candidate gates, prototyped

- **Static safety gate** (reject when the moving piece can be profitably
  captured): noise 22.4% → 8.6%, but sacrificial tactics collapse —
  doubleCheck 40→31, discoveredAttack 32→17, capturingDefender 11→4. Safety is
  the wrong question; the best tactics are unsafe on purpose.
- **Line verification** (the claimed motif only counts if the engine's own
  continuation converts it into material or mate): noise **22.4% → 2.5%**, with
  fork 40/40 and mateIn1 40/40 held and hangingPiece recall improved. This is
  also what Lichess's own tagger rests on — it tags themes over an
  engine-verified *solution line*, never a single ply.

**Conclusion:** the detectors ask "does this shape exist on the board?" The
question that produces coaching-grade output is "does this shape *win
something* in the line the engine is about to play?"

## 3. Root causes

None of these are bugs in an individual detector. Each detector does exactly
what its doc comment says.

1. **Detection is static and single-ply.** `classifyTacticMotif` replays one
   move, builds an attack map, pattern-matches. No exchange evaluation, no
   opponent reply, no consequence. A working SEE lives in `see.ts` and **no
   detector calls it**.
2. **Motifs are single-label, resolved by a hard-coded priority list.**
   `tactic-detectors/registry.ts` returns the first match. Real tactics are
   multi-label.
3. **There is no precision test, only a recall test.**
   `lichess-puzzle-validation.test.ts` asks "did we ever produce this label on a
   real tactic?" A detector that fires on everything scores 40/40. The suite
   passes today at a 22.4% false-positive rate on book theory.
4. **The vocabulary is offence-only and coarse.** Thirteen types, all things you
   do to the opponent. No unpin, escape, defence, tempo, deflection, decoy,
   interference, clearance, X-ray, zwischenzug, desperado, mating net, or
   promotion race — so those moves fall through to "Nothing to flag."
5. **The prevention path diffs sets of type names.**
   `tactic-prevention-check.ts` compares motif *types* reachable before and
   after a move. Every layer-1 false positive is amplified into a second false
   sentence ("Defused the opponent's fork").

## 4. Target architecture — four layers instead of one

Keep the detector-per-file structure and the registry pattern. Replace what
sits around them. All of this stays inside `packages/chess-analysis` (pure, no
I/O) per golden rule 5.

### Layer 1 — propose

`TacticDetector.detect()` returns `TacticClaim[]` instead of `boolean`:

```ts
interface TacticClaim {
  type: TacticMotifType;
  actor: Square;            // the piece doing it
  targets: Square[];        // what it hits
  victim: Square | null;    // the piece expected to fall
  expectedGain: number;     // static estimate, pawns
  evidence: TacticVisualDto; // arrows/highlights, computed once
}
```

Detectors get **looser**, not tighter — over-propose and let layer 2 decide.
Two structural fixes land here:

- Every detector becomes **move-scoped**. Today `trappedPieceDetector` fires on
  any trapped piece anywhere on the board, related to the move or not.
- The claim carries its own squares, so the sentence and the board arrow come
  from one object instead of a second replay in `tactic-hit-detail.ts`.

### Layer 2 — verify

Walk the engine's PV from this move for 4–8 plies and test each claim:

- **Material** — does the mover's material rise by ≥ ~1.5 within the line, or
  is it mate?
- **Attribution** — is the material won *on one of the claim's own target
  squares*, or by the claim's own actor? This separates "the fork won the rook"
  from "something good happened four moves later."
- **Eval** — for motifs where no material changes hands (pin, trapped,
  overload), require a win-probability swing instead, from the multi-PV gap
  `isTacticalPosition` already computes.
- **Exchange sanity** — SEE on the actor's landing square as an *input to the
  confidence score*, never a veto, so sacrifices survive.

Surviving claims carry a confidence. This is the layer that turns 22.4% into
2.5%.

### Layer 3 — rank

Keep every verified claim on the move; choose the *headline* by verified gain
and specificity, not array order. `priority` in the registry demotes to a
tie-breaker of last resort. Rebuild `tactic-prevention-check.ts` to compare
verified claims *with their target squares*, so "you defused it" means the
threatened piece is no longer winnable — not that a type name left a set.

### Layer 4 — narrate

The claim names actor, victim and gain, so the sentence carries the
consequence: *"Wins the rook — the knight on d6 forks e8 and b7"* rather than
*"Found the fork."* Add the defensive family so `4…Bd7` reads "Breaks the pin",
and an explicit quiet-move vocabulary so "Nothing to flag" is reserved for
moves that genuinely have nothing rather than moves we have no word for.

Prompt-facing text for any of this belongs in `packages/prompts` per golden
rule 9; the deterministic reason strings stay in
`packages/chess-analysis/src/tactic-reason-text.ts`.

## 5. Vocabulary gap

Current `TACTIC_MOTIF_TYPES` (13): `checkmate`, `brilliantSacrifice`,
`doubleCheck`, `fork`, `skewer`, `pin`, `discoveredAttack`,
`overloadedDefender`, `removesDefender`, `weakBackRank`, `trappedPiece`,
`freePiece`, `other`.

Target additions:

- **Offensive:** `deflection`, `decoy`, `interference`, `clearance`,
  `xRayAttack`, `zwischenzug`, `desperado`, `windmill`, `smotheredMate`,
  `matingNet`, `promotionTactic`, `underPromotion`, `pawnBreakthrough`,
  `attractionSac`.
- **Defensive / prophylactic:** `breaksPin`, `escapesFork`,
  `defendsHangingPiece`, `blocksThreat`, `counterAttack`, `removesTarget`,
  `perpetualCheck`, `stalemateResource`, `simplifiesToDraw`, `prophylaxis`.
- **Positional (so "quiet" isn't silence):** `gainsTempo`, `develops`,
  `improvesWorstPiece`, `seizesOpenFile`, `outpost`, `spaceGain`,
  `preparesBreak`, `favourableTrade`, `kingSafety`.

The defensive family is where this can go past chess.com and Lichess: a
coaching product cares about the move that *stopped* something, a puzzle
database does not. Note the defensive detectors mostly fall out for free once
claims are objects — a move that removes a verified enemy claim is a defensive
motif, named after what it stopped.

## 6. Engine breadth

Layer 2 consumes lines, not just a best move. Where lines go missing today:

- `ENGINE_MULTI_PV = 5` is requested everywhere, but chess-api.com caps
  free-tier variants at 5 and often returns fewer — `logVariantShortfall`
  in `chess-api-engine-backend.ts` exists because this was already observed.
- The Lichess eval index serves whatever line count the community stored.
- `LiteSupplementedEngineBackend` — the decorator that fills a shortfall from
  the user's browser at depth 8 / 6 lines — **only implements
  `analyzePosition`**. Its `analyzeGame` delegates straight to `main`, and game
  review goes through `analyzeGame`. Review therefore never touches it.

Fix, in order:

1. **Extend the decorator to `analyzeGame`.** Tunnel, `lite` WASM variant,
   shared worker, and the merge policy that never lets lite override `main`'s
   line 1 all exist and are tested. Highest-leverage change here.
2. **Make it a background review-time job**, not request-blocking. A user with
   no tab connected gets today's narrower analysis.
3. **Budget by ply.** Only plies already flagged `isTacticalPosition`, or
   carrying a candidate claim, need breadth — typically 15–25% of a game, which
   fits the ~3s/position `LITE_SUPPLEMENT_MOVETIME_MS` budget.
4. **Store widened lines separately.** `position_evaluations` is keyed by FEN
   with no depth discrimination and lite results are explicitly untrusted for
   it, so review-breadth lines need their own table/column.

Beyond "more alternatives to show": the current `found`/`missed` framing is
binary against `lines[0]`. With 5–8 real lines the review can say *"the fork was
there on your third choice too"*, and stop calling a move a miss when it was
second-best at equal evaluation.

## 7. Delivery order

| Phase | Work | Why here |
| --- | --- | --- |
| A | **Precision test first.** False-positive suite over `openings.tsv` + a quiet corpus asserting a label-rate ceiling; add per-theme precision alongside recall in `lichess-puzzle-validation.test.ts`. | Nothing later is measurable without it, and this is the test that would have caught all of this pre-release. TDD per AGENTS.md. |
| B | **Line verification** (claims → PV walk → material/eval attribution). Reuses `annotatePvTactics`, `applySanSequence`, `see.ts`. | The 22.4% → 2.5% change. Ship behind A's ceiling so the drop is a CI number. |
| C | **Multi-label claims + ranked headline.** Detector signature change, `priority` demoted to tie-breaker. | Recovers the recall first-match currently discards; unifies sentence and arrow. Schema change in `packages/shared`. |
| D | **Defensive + quiet vocabulary.** | Retires "Nothing to flag" as the default answer. Nearly free once claims are objects. |
| E | **Browser engine breadth for review** (`analyzeGame` on the lite decorator, ply-budgeted, stored outside the trusted eval cache). | Independent of A–D, can run in parallel. |
| F | **Rebuild the prevention path on verified claims.** | Worth little until A–C make claims trustworthy; currently the loudest amplifier of their errors. |

### Acceptance bar, enforced in CI

- **Precision ≥ 95%** on a held-out quiet corpus — at most 1 in 20 book/quiet
  moves carries a tactic sentence, and those that do are verified.
- **Recall ≥ 90%** per theme on the Lichess fixture, measured multi-label as
  "the correct motif is among the verified claims."
- **Coverage:** under 10% of non-book moves fall through to "Nothing to flag."
  This is the metric chess.com does not optimise for.
- **Attribution:** every motif sentence names a concrete consequence — a piece
  won, a mate, or a measured evaluation swing. No sentence ships that can't say
  what the tactic gets you.
