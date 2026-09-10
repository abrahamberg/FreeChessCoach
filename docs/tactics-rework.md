# Tactical review rework — investigation and plan

Status: **all phases landed.** This document records why Game Review's tactic
sentences were wrong, what was measured, and the architecture that fixed it.
It is a companion to `docs/algorith.md` §7.2 (tactics score) and
`packages/chess-analysis/src/tactic-detectors/README.md` (how a detector is
added).

The §1 and §2 numbers are the **before** measurements, taken against
`packages/chess-analysis` at commit `96dc8fc` and read against ten chess.com
Game Review cards (September 2026). They are kept in the past tense
deliberately: they are what the tests in §8 exist to stop coming back. Where
a section describes the fix, §8's table says what shipped and what it
measured afterwards.

---

## 1. Symptoms, and the exact code behind each

Ten reported Game Review cards, from three games. Every sentence below
reproduces on current `main` by running `classifyTacticMotif` +
`tacticHitDetail` over the position, and each is pinned as a fixture in
`packages/chess-analysis/src/tactic-review-cases.ts` under the id in the first
column.

Game A is `1.e4 e5 2.Nf3 Nc6 3.Bc4 d6 4.Bb5 Bd7 5.d4 exd4 6.Bxc6 bxc6 7.Qxd4 c5`
with the user playing White; its FENs are derived from that move list, so they
are exact. B and C were read off the board and then verified by replay. D is
constructed and says so.

| Case | Move | Printed today | Wrong how |
| --- | --- | --- | --- |
| TR-01 | A `4.Bb5` | "Found the pin — pins the knight on c6 against e8." | Headline right — a real absolute pin. But `trappedPiece` co-fires, and the sentence names e8 rather than the king. |
| TR-02 | A `4…Bd7` | *nothing* | **Breaks the pin** on c6. No defensive motif exists, so the card is the empty state. |
| TR-03 | A `6.Bxc6` | "Found the fork — bishop on c6 forks b7 and d7." | A trade; the bishop is recaptured next move. `forks()` never checks that the forking piece is itself hanging. Four detectors fire on this one exchange. |
| TR-04 | A `6…bxc6` | "Found the free piece — captures the undefended bishop on c6." | A recapture. `captureOpportunities` has no notion of an exchange sequence. |
| TR-05 | A `7.Qxd4` | "Found the pin — pins the pawn on g7 against h8." | The pawn is not attacked and the pin prevents nothing. `pins()` is pure ray geometry. |
| TR-06 | A `7…c5` | *nothing* | Hits the queen with tempo. No tempo/positional motif exists. |
| TR-07 | B `Bh2+` (best) | "Found the discovered attack — queen on e7 gains a discovered attack on e4." | Headline right. `trappedPiece` co-fires ("queen on e4 is trapped"), and the sentence names a square instead of the queen it wins. |
| TR-08 | B `Bh2+` (brilliant) | "Found the brilliant sacrifice with Bh2+." | `classifyTacticMotif` answers from the raw quality flag **before the registry runs**, discarding the discovered attack the detector already found. |
| TR-09 | D `Nc5+` | "Found the discovered attack — rook on e1 gains a discovered attack on e8." | A true discovered check. There is no `discoveredCheck` motif, so the card never says the move is forcing or that e8 is the king. `doubleCheck` needs two checkers, so it can't cover it. |
| TR-10 | C `16.Rae1` | "Found the pin — pins the bishop on e7 against e8." | Headline right — the textbook pin the rework must not break. Same two problems as TR-01: `trappedPiece` co-fires, and the sentence names e8 rather than the king. |

One further screenshot item — "pawn on e5 is trapped" — was already fixed by
`96dc8fc` (`trappedPieces()` no longer counts pawns). Production is one release
behind on that; everything above is live on `main`.

### The three pins are a matched set

TR-01, TR-05 and TR-10 are what the pin rework is judged on: two real absolute
pins that must survive, and one phantom relative pin on a pawn that must not.
Running §5's proposed pin gate (drop pinned pawns; a relative pin needs its
victim under net pressure) over them:

| Case | Pin | Gate |
| --- | --- | --- |
| TR-10 `16.Rae1` | absolute, bishop → king | **kept** |
| TR-01 `4.Bb5` | absolute, knight → king | **kept** |
| TR-05 `7.Qxd4` | relative, **pawn** → rook | **rejected** |

Neither surviving pin wins material — TR-10's bishop is defended twice and
attacked once — so both only survive a gain test that has a **positional rung**
alongside material and tempo. chess.com makes no material claim on either
("That pin is like a Venus flytrap, snapping shut on their bishop!"), which is
the same design.

### Two findings from TR-07 that are load-bearing for the plan

1. **The static-safety gate would have deleted this tactic.** `see()` on h2 is
   **+330 for White** — the bishop is plainly hanging, because that is the
   point. This is the concrete counterexample to §2's safety gate, in a real
   user game: verification has to ask "did the line pay?", never "is the piece
   safe?".
2. **`trappedPieces` reads "cannot move" as "cornered".** It asks whether a
   piece has a legal move to an unattacked square, and `chess.moves({ square })`
   answers "no" for two much more common reasons than being cornered: the
   piece's own side is in check, or the piece is absolutely pinned. Attributing
   every report across the 400-line opening corpus:

   | Why it fired | Share |
   | --- | --- |
   | absolutely pinned | 71.7% |
   | own side in check | 13.2% |
   | genuinely cornered | 15.1% |

   So **85% of the detector's output in ordinary play is an artefact.** (Across
   quiet moves in the sharp puzzle positions the mix inverts to 76.8% genuinely
   cornered — which is the point: the bug dominates exactly where the noise
   hurts most.) It is also why `trappedPiece` co-fires on all three real pins.

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

Narrowing to recaptures makes the point sharper still. A recapture is the most
ordinary move in chess and is almost never a tactic; on the 400-line corpus
`tactic-precision.test.ts` uses, **97 of 113 recaptures (85.8%) carry a tactic
label**. `freePiece` alone accounts for most of it.

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

## 3. What chess.com actually does differently

Ten Game Review cards, transcribed:

| Their sentence | Shape | What it forced them to compute |
| --- | --- | --- |
| "You had an opportunity to **win a bishop** through a discovered attack." | you · missed | which piece falls, in the line |
| "Your better option was to **win a tempo** by threatening a queen." | you · missed | the alternative's gain type |
| "You **uncorked a fork** and it is putting heat on them." | you · found | motif + eval swing |
| "Their move **stopped you** from being able to win a rook through a fork." | them · prevented | the threat *you* lost |
| "They missed a chance to win a rook through an **eventual** fork." | them · missed | + how many moves away |
| "Their best option was to **send a queen into the game**." | them · missed | non-material vocabulary |
| "You allowed a fork this game, which is **unusual for you**." | game · baseline | this player's cross-game rate |
| "Your strategic play was **weaker than usual**… look at your worst piece." | game · baseline | cross-game score + a drill |
| "You made your bishop **vulnerable**, but it was a brilliant sacrifice!" | you · found | that the piece is hanging *and* that it is sound |
| "That **pin** is like a Venus flytrap, snapping shut on their bishop!" | you · found | a bind with no material — their positional tier |

**The sentence template is the verification contract.** You cannot fill
`win a <piece> through a <motif>` without having computed which piece falls.
Ours — `Found the <motif> — <geometry>` — is fillable from board shape alone,
which is exactly why it prints on a fianchetto. Adopt their grammar and detector
honesty is forced: a detector that can't name what it wins can't produce a
sentence.

Six rules worth stealing:

1. **The payoff is the subject; the motif is a subordinate clause.**
   *Win a rook* **through** *a fork*. We invert it — the pattern name leads and
   there is no payoff in the sentence at all.
2. **Be *less* specific, not more.** They never name a square. Our "bishop on c6
   forks b7 and d7" carries more information and far more ways to be wrong, and
   a 1200-rated reader can't act on the squares anyway. Specificity should be
   *earned by confidence*: full geometry when the line confirms it, the bare
   motif at medium confidence, silence below that.
3. **Speak to the viewer, not the mover.** "You"/"they" on both sides' moves. We
   already carry `isUserMove` on every move (`classify.ts:187`) and
   `game.userColor` in the review page — and `tactic-reason-text.ts` reads
   neither. On an opponent move we print "Found the fork" as though the user
   played it, and "Defused the **opponent's** fork" where the opponent *is* the
   user.
4. **A defused threat is your lost chance, not their achievement.** Same
   computation as `findDefusedThreats`, framed as something that happened to the
   reader.
5. **Say when it wasn't immediate.** "an *eventual* fork". `annotatePvTactics`
   already returns `forkInPlies`; nothing narrates it.
6. **Game-level notes are relative to the player's own history.** "unusual *for
   you*", "you *normally* keep your pieces safe". `build-stats-dashboard.ts`
   already aggregates per-motif opportunities/found/preventable/prevented across
   a user's games — the baseline exists and nothing consumes it for copy. Tone
   tracks deviation size ("—no big deal!").

Our five cases under this grammar (the user played White here, so the two good
moves belong to the opponent — the case our current copy gets grammatically
wrong):

| Move | Today | Rewritten |
| --- | --- | --- |
| `6.Bxc6` | "Found the fork — bishop on c6 forks b7 and d7." | — (the fork wins nothing) |
| `6…bxc6` | "Defused the opponent's fork — …" | — (there was no fork) |
| `7.Qxd4` | "Found the pin — pins the pawn on g7 against h8." | — (no pin worth naming) |
| `4…Bd7` | "Nothing to flag" | "They broke the pin on their knight." |
| `7…c5` | "Nothing to flag" | "They won a tempo by threatening the queen." |

## 4. Root causes

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
5. **The sentence template asks nothing of the detector.**
   `Found the <motif> — <geometry>` is printable the instant a shape matches.
   Nothing in the copy requires a consequence, a perspective or a horizon, so
   nothing in the pipeline was ever obliged to compute one. See §3.
6. **The prevention path diffs sets of type names.**
   `tactic-prevention-check.ts` compares motif *types* reachable before and
   after a move. Every layer-1 false positive is amplified into a second false
   sentence ("Defused the opponent's fork").

## 5. Target architecture — five layers instead of one

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

Adopt §3's grammar literally. One template,
`<subject> <outcome-verb> <gain> <horizon?> through <motif>`, filled from the
verified claim:

- **Subject** — "You"/"They", from `isUserMove`, already on every move.
- **Outcome verb** — found / missed / allowed / prevented: the 2×2 of whose move
  it was and whether the claim was executed.
- **Gain** — the claim's verified prize: a named piece, a tempo, mate, or a
  measured evaluation swing. A claim with no gain gets no sentence.
- **Horizon** — immediate / in two / eventual, from `forkInPlies`, which
  `annotatePvTactics` already computes and nobody reads.
- **Specificity** — squares only at high confidence, the bare motif at medium,
  nothing at low. One template with three degradation levels rather than one
  always-maximal sentence.

Add an explicit quiet-move vocabulary so "Nothing to flag" is reserved for moves
that genuinely have nothing rather than moves we have no word for.

### Layer 5 — compare

"You allowed a fork this game, *which is unusual for you*" is a different
product from "Tactics: 1 allowed." It needs a per-user rate per motif and a
deviation test — and `build-stats-dashboard.ts` already aggregates
opportunities/found/preventable/prevented per motif across a user's games. The
baseline is computed and unused for copy. Three things fall out of it: a
**headline** naming the motif most out of line with this player's history; a
**tone** that tracks deviation size, so a first lapse reads as a note and a
pattern reads as a weakness; and an **actionable close** — chess.com pairs every
game-level card with a drill, which is the natural handoff into our coach
session and puzzle assignment.

Prompt-facing text for any of this belongs in `packages/prompts` per golden
rule 9; the deterministic reason strings stay in
`packages/chess-analysis/src/tactic-reason-text.ts`.

## 6. Vocabulary gap

Current `TACTIC_MOTIF_TYPES` (13): `checkmate`, `brilliantSacrifice`,
`doubleCheck`, `fork`, `skewer`, `pin`, `discoveredAttack`,
`overloadedDefender`, `removesDefender`, `weakBackRank`, `trappedPiece`,
`freePiece`, `other`.

Target additions:

- **Offensive:** `discoveredCheck` (today it collapses into
  `discoveredAttack`, losing the fact that the move is forcing — the cheapest
  addition on this list, since `discoveredAttackDetail` already computes the
  revealed square and only needs to ask whether it holds the king),
  `deflection`, `decoy`, `interference`, `clearance`, `xRayAttack`,
  `zwischenzug`, `desperado`, `windmill`, `smotheredMate`, `matingNet`,
  `promotionTactic`, `underPromotion`, `pawnBreakthrough`, `attractionSac`.
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

## 7. Engine breadth

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

## 8. Delivery order

| Phase | Work | Why here |
| --- | --- | --- |
| 0 ✅ | **Fix the voice.** Rewrite `tactic-reason-text.ts` to §3's template and feed it `isUserMove`: you/they instead of "the opponent", defused reframed as your lost chance, horizon from `forkInPlies`. | No detector changes, one file plus its test, data already present. Removes the grammatically wrong copy on every opponent move and establishes the template B–C must then satisfy. |
| A ✅ | **Precision test first.** `tactic-precision.test.ts` (three corpus ceilings) and `tactic-review-cases.ts` / `tactic-review-cases.test.ts` (the six named cards from §1). | Nothing later is measurable without it, and this is the test that would have caught all of this pre-release. TDD per AGENTS.md. |
| B ✅ | **Line verification** (claims → PV walk → material attribution), plus the static gates that carry every engine-free caller. Reuses `applySanSequence` and `see.ts`. | The noise change. Shipped behind A's ceilings so the drop is a CI number, not a claim. |
| C ✅ | **Multi-label claims + ranked headline.** Detector signature change, `priority` demoted to tie-breaker. | Recovers the recall first-match was discarding; unifies sentence and arrow. Schema change in `packages/shared`. |
| D ✅ | **Defensive + quiet vocabulary.** Thirty new detectors. | Retires "Nothing to flag" as the default answer. Nearly free once claims are objects — a defensive motif is an enemy claim that is gone. |
| E ✅ | **Browser engine breadth for review**: `analyzeGame` on the lite decorator, budgeted to the plies `isTacticalPosition` already flags and capped at 24 of them, with the decorator outside the cache so `position_evaluations` still only ever sees `main`'s lines. | Independent of A–D. Feeds B: verification asks about the engine's *lines*, and review had none to ask about. |
| F ✅ | **Rebuild the prevention path on verified claims.** | Worth little until A–C made claims trustworthy; it was the loudest amplifier of their errors. |
| G ✅ | **Baseline-relative game report.** Per-user motif rates from the existing cross-game aggregate, a deviation test, game-level cards that say "unusual for you" with a drill attached. Derived at read time on `GET /api/games/:id`, never stored — what counts as unusual changes with every game played after this one. | Depends on A–D producing rates worth comparing; the aggregation itself was already built. |

### What phase A put in place

Three corpus ceilings in `packages/chess-analysis/src/tactic-precision.test.ts`,
each pinned to the exact measured value and carrying the target it must ratchet
down to. Lower a ceiling in the same commit that earns it:

| Gate | Today | Target (after phase B) |
| --- | --- | --- |
| Opening-theory label rate (400 lines / 4,332 plies) | 640 = 14.8% | ≤ 5% |
| Recaptures carrying a label | 97 / 113 = 85.8% | ≤ 5% |
| Quiet moves in 120 puzzle positions | 897 / 3,040 = 29.5% | ≤ 10% |

Plus ten named cards in `tactic-review-cases.ts` (the shape and the
fixed/unfixed rule live alongside in `tactic-review-case.ts`) — exact FENs from the game in
§1, each with the sentence the pipeline prints today and the motif it must
produce after the rework. `tactic-review-cases.test.ts` asserts *today's*
motif, *today's* full set of firing detectors, and *today's* sentence, so any
detector change surfaces as a named diff rather than a number moving.
`KNOWN_TACTIC_REVIEW_DEFECTS` is the debt list and the suite fails if a case is
fixed without being taken off it; each case also carries a hand-written
`defect` kind (phantom / missing / mislabelled / noisy-co-fire / lost-detail)
that the test cross-checks against the computed today-vs-target mismatch, so the
prose cannot go stale either. `TACTIC_REVIEW_TRUE_POSITIVES` lists the cases
that must still name a tactic afterwards — without it, every ceiling above could
be met by deleting the detectors.

Recording the **full detector set** rather than just the winning motif is what
makes the fixture useful for phase C: `TR-03` (`6.Bxc6`) fires four detectors —
`fork`, `pin`, `removesDefender`, `freePiece` — on one ordinary exchange, so the
priority list is picking a winner among four wrong answers.

### What actually landed

Every phase shipped. The measurements below are from the same two corpora §2
used, re-run after the rework:

| Gate | Before | After | Target |
| --- | --- | --- | --- |
| Opening-theory label rate (400 lines / 4,332 plies) | 640 = 14.8% | 135 = 3.1% | ≤ 5% ✅ |
| Recaptures carrying a label | 97 / 113 = 85.8% | 2 / 113 = 1.8% | ≤ 5% ✅ |
| Quiet moves in 120 puzzle positions | 897 / 3,040 = 29.5% | 230 = 7.6% | ≤ 10% ✅ |

Recall rose on every Lichess theme at the same time, because §5 layer 3's
multi-label view stopped throwing away motifs the detectors had already found:

| Theme | Before (first match) | After (multi-label) |
| --- | --- | --- |
| skewer | 33/40 | 40/40 |
| trappedPiece | 18/40 | 29/40 |
| hangingPiece | 10/40 | 29/40 |
| capturingDefender | 11/40 | 15/40 |
| discoveredAttack | 32/40 | 37/40 |
| pin | 24/40 | 27/40 |
| fork · doubleCheck · mateIn1 | 40/40 | 40/40 |

Coverage moved the other way on purpose: 52% of opening-theory plies and 59%
of quiet moves now carry *some* label, against 4% and 7% before, because the
defensive and positional families finally have words for what those moves are
doing. The precision ceilings measure only the **offensive** family — a
phantom *tactic* is what they were always about, and every motif that existed
when they were first measured was offensive — so the two numbers do not fight.

All ten cards in §1 reach their target and `KNOWN_TACTIC_REVIEW_DEFECTS` is
empty. Three notes on how, since none was a detector fix:

- **TR-04 and TR-05** are only distinguishable from a windfall capture if the
  detectors know the opponent's previous move. A FEN cannot carry it and the
  report pipeline has it, so `TacticDetectionContext` takes it.
- **TR-03** needed the `'other'` catch-all retired. A card that says a tactic
  happened without naming it is exactly what the acceptance bar rules out.
- **TR-02 and TR-10** legitimately carry more claims than the fixture
  originally sketched (`develops`; `seizesOpenFile` + `improvesWorstPiece`).
  Those are true, and being able to say them is the point of phase D — the
  co-fire §1 called a defect was a *false* claim, not a second true one.

Two `see.ts` bugs surfaced the moment the detectors started calling it, which
no detector had ever done: flipping the side to move left an illegal
en-passant square behind, and an exchange could "capture" a king and produce a
FEN chess.js refuses to load.

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
- **Voice:** every card addresses the reader as "you" or "they" correctly for
  the side that moved, and no card names a square it hasn't verified.
  Snapshot-tested, the same way the coach prompts already are.

---

## 9. Second review pass — what the cards still got wrong

Read against a second real game once A–G were live. The detectors were right
on every card below; what was wrong was **which sentence led, whose move the
card was about, and what the review had no word for**. Three rules shipped in
answer, each with its own file and test.

| Reported card | Why it read wrong | Rule |
| --- | --- | --- |
| A blunder that dropped a queen opened with "You stopped them winning a bishop through a discovered attack", with "You missed a chance to win a queen…" underneath. | The two sentences were ordered by *where they were appended* — prevention in `attachTacticPrevention`, opportunity in `build-game-report.ts` — never by what they were worth. | **`tactic-card-order.ts`.** A move that cost evaluation is read for what it missed, so on an inaccuracy/mistake/miss/blunder the missed chance opens the card; otherwise the bigger prize leads, priced the way a claim's own headline is. The Review UI and the plain-text `reasons` array both order by it. |
| `Nxf6+` forked the queen with check and printed "You missed a chance to win a queen through a trapped piece two moves away with `Bb5`". | The opportunity is read off `lines[0]` alone, so every other move is a miss by construction — including one that wins as much. §7 named this case and nothing implemented it. | **`played-tactic-alternative.ts`.** When the played move gave up nothing (`drop ≤ CONFIG.severity.excellentMaxDrop`) and its own verified headline is worth at least the one it passed up, the card names *their* tactic and counts as found. Gated on the engine's move having a headline at all, so which plies count as opportunities is unchanged. |
| `4…Nxd4` said only "Best move"; the natural retake `5.Nxd4` said "Costs 8 squares of piece mobility". | A recapture is the most ordinary move in chess and the reason builder had no word for one — only fault-finding vocabulary, printed on moves that were not at fault. | **`trade-description.ts`**, plus `mobilityReason` gated on `isImprovableQuality`. Even exchanges get "Recaptures the knight on d4" / "Trades knights on d4"; a won or lost one keeps the tactic/hanging-piece sentence it already had. |

Two smaller fixes rode along: `breaksPin`'s detail said "**their** knight on
c6 can move again" about the reader's *own* freed piece (the claim detail is
voice-agnostic, so it carries no possessive now), and `tacticOpportunity`
gained `embodiedBySan` — the move the motif was actually read off, which
`motifToCode` has to replay now that it isn't always the engine's.

One symptom in the same report is **not** a code problem: a move chess.com
still calls book that we score as a mistake. Our book is
`data/openings.tsv` (the Lichess chess-openings set, ~3.8k lines); theirs is
a game database orders of magnitude larger. Widening it is a data change, not
a detector change.

### The queen nobody mentioned — and the fourth outcome verb

The same report, one card further in. `9…Qd7` walks into `Bb5`, which pins
the queen against the king and wins it; the eval bar reads **+5.8**. The card
on that move said:

    They missed a chance to break the pin with Be7 — the knight on f6 is free to move again.
    Their move stopped you overloading a defender — overloads the king on e8.

Both true, neither the point. Three separate things were wrong, and each one
alone was enough to lose the queen:

1. **An absolute pin was always priced at zero.** `verifyPin` returned
   `{gain: 0}` for every pin against a king, because the two pins in the
   fixture (TR-01, TR-10) win nothing and survive on the positional rung. A
   piece that cannot legally move and is attacked at a profit is not bound,
   it is lost — so `absolutePinVerdict` now prices the pinned piece by the
   same exchange question every other motif answers, and re-labels the claim
   `material` when it pays. TR-01 and TR-10 are unchanged: their exchange
   wins nothing.
2. **A pin's payoff can land on the pinner's own square.** The answer to
   `Bb5` is `Qxb5`, so the line pays on b5 while the claim names d7 and e8,
   and `attributes` dropped the claim on the exact line that proved it. The
   ray-bind motifs (`pin`, `skewer`, `xRayAttack`) now attribute on the
   actor's square too. Not the others: material on a *forker's* square means
   the forker was traded off, which is the opposite of the fork paying.
3. **Nothing said what the move handed over.** §5 layer 4's outcome verbs are
   found / missed / allowed / prevented, and "allowed" had nowhere to live —
   so what `Qd7` cost was narrated only on White's next move, as a chance
   White then missed. `tactic-allowed.ts` reads the next ply's own
   opportunity back onto the move that caused it, on any move that cost
   evaluation and gave up material or mate, and `tactic-card-order.ts` opens
   the card with it:

       They let you win a queen through a pin two moves away with Bb5 — the queen on d7 is stuck in front of the king.

   Nothing new is detected: it is the same claim, prize and geometry the next
   ply's card carries, which is also why its arrows are already drawn for the
   board this move produced.

The `pin` detail lost its possessive along the way, for the reason
`breaksPin`'s did: the card is printed from both sides now, so "their queen
on d7" named the wrong side's piece on one of them.

The same report's `13.Nxf6+` — a royal fork taking the queen with check —
still printed "You missed a chance to win a queen … with Bb5", because
§9's equal-value rule compared the two claims strictly and they priced the
same queen at 5.8 (SEE) and 6.0 (line-walked). Two ways to win one queen are
not a miss of either: the comparison carries `equalPrizeTolerancePawns` of
slack now, and a move that *collected* material qualifies whatever its drop,
since "you missed a chance to win a queen" is simply false on the move that
won it. A missed **mate** still stays missed — nothing short of mate is as
much, and the pawn-weighted comparison would otherwise rank a queen above
one.

### A gate that was tried and reverted

Dropping `breaksPin` claims for *relative pins on pawns* — TR-05's phantom
shape, wearing a defensive hat — is correct in isolation and makes the
`tactic-precision.test.ts` quiet-move ceiling **worse**: 230/3040 → 258/3040
(7.6% → 8.5%, over the 8% ceiling). The phantom defensive claim was
outranking phantom *offensive* claims on those plies, and removing it
promotes them to the headline. Trading one wrong sentence for another is not
a fix; the ranking or those offensive claims have to be dealt with first.
