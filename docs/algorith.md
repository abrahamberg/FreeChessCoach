# popular chess sites-Style Game Analysis Metrics — Implementation Specification

**Audience:** an LLM that will write the TypeScript implementation, and curious human  
**Status of this document:** algorithm specification only. Pseudocode below is illustrative, not the deliverable.
**Goal:** reproduce popular chess sites's Game Review numbers as closely as is publicly possible, from an existing Stockfish + chess.js analysis pipeline.

| Tag | Meaning |
|---|---|
| 🟢 **EXACT** | Published formula. Implement literally, do not "improve" it. |
| 🟡 **REVERSE-ENGINEERED** | Community consensus, reproduces popular chess sites closely but not bit-exact. Implement literally, keep constants in a config object. |
| 🔴 **HEURISTIC** | popular chess sites has never published this. The formula below is a principled design that produces popular chess sites-*shaped* output. Must be calibrated (§10). |

Three sources of irreducible drift, which the implementer should not try to eliminate:

1. **Engine difference.** popular chess sites runs its own Stockfish build at its own depth/nodes/threads. Different depth → different `cp` → different accuracy. Depth 18 MultiPV 3 (as in the sample payload) is a reasonable target; **the same depth must be used for every position in a game**, or accuracy becomes noise.
2. **Opening book difference.** popular chess sites's book determines where "Book" moves stop and where the Opening phase ends. A different book shifts both.
3. **Model difference.** popular chess sites's rating estimator is a trained model over their own player population. No closed-form formula can be identical.

---

## 1. Input contract

### 1.1 What already exists (per ply)

Per the current pipeline, each position yields:

```ts
interface EngineLine {
  cp: number | null;
  mateIn: number | null;
  moveSan: string;
  moveUci: string;
  pvSan: string[];
}

interface PositionAnalysis {
  fen: string;
  eval: { cp: number | null; mateIn: number | null };
  depth: number;
  multiPv: number;
  bestMove: string;          // SAN
  lines: EngineLine[];       // ordered best-first for the side to move
  features: Features;        // forks, hangingPieces, mobility, controlledSquares, ...
}
```

### 1.2 ⚠️ Sign convention — verify this before anything else

In the sample payload the position is **Black to move**, and the three lines are `e6 (cp -8)`, `Nf6 (cp -2)`, `a6 (cp +23)`, with `bestMove = "e6"`. The best move is the **most negative**, which is only consistent with evals being stored **from White's perspective** (Black minimizes).

The whole document assumes:

> **`cp` and `mateIn` are always from White's perspective.** Positive = good for White. `mateIn > 0` = White mates.

**Action for the implementer:** add a runtime assertion at ingest — for a Black-to-move position, `lines[0].cp` must be `<= lines[1].cp`; for a White-to-move position, `>=`. If the assertion fires, the pipeline's convention is side-to-move-relative and every eval must be negated for Black-to-move positions before use. Every formula downstream is sign-sensitive; getting this wrong silently produces plausible-looking garbage.

### 1.3 What must be added

None of these need a new engine call except where noted.

| Data | Where from | Needed by |
|---|---|---|
| `legalMoveCount` | `chess.js` `moves().length` | Forced, Great, Brilliant |
| `isCapture`, `isCheck`, `isPromotion`, `isCastle` | `chess.js` move object | classification, Brilliant |
| `movedPieceType`, `capturedPieceType` | `chess.js` | Brilliant, Tactics |
| **SEE** (Static Exchange Evaluation) for a target square | new pure function, ~80 LOC | **Brilliant** (mandatory), Tactics |
| `nonPawnMaterial` per side, `queensOnBoard` | derive from FEN | phase segmentation |
| `bookMove: boolean` + `eco`, `openingName` | opening book / ECO database keyed by FEN-without-clocks | Book label, Opening phase, Opening score |
| `castledPly` per side, `developedPieces` count | derive from move list | Opening score |
| **Opponent-reply eval after a sacrifice** | 1 extra shallow engine call **only** for Brilliant candidates | Brilliant soundness check |

**SEE contract** (implement carefully, it is load-bearing for Brilliant):

```
see(fen, targetSquare, sideToMove): number
// centipawn result of the full capture sequence on targetSquare,
// both sides playing least-valuable-attacker first,
// each side free to stand pat.
// Piece values for SEE: P=100 N=320 B=330 R=500 Q=900 K=20000
```

Also needed: `seeOnAllOpponentCaptures(fenAfterMove, movingColor)` → the most negative SEE the opponent can obtain against the mover. This is the "is my piece really hanging?" test.

---

## 2. Core primitives

### 2.1 Eval → centipawn scalar 🟡

Mate scores must be folded into the same scale, saturating rather than exploding.

```
MATE_BASE = 2000
CP_CLAMP  = 2000

toCpWhite(evalObj):
  if evalObj.mateIn != null:
    sign = evalObj.mateIn >= 0 ? +1 : -1
    return sign * (MATE_BASE - 10 * min(abs(evalObj.mateIn), 50))
  return clamp(evalObj.cp ?? 0, -CP_CLAMP, +CP_CLAMP)
```

Rationale: `M1` → 1990, `M10` → 1900, `M50` → 1500. Monotone (faster mate scores higher) but all map to >99.9% win probability, so **failing to find the fastest mate costs ~0 accuracy**. That is correct — popular chess sites does not punish slow mates in accuracy; it flags them via the `Miss` label instead (§5.8).

### 2.2 Centipawns → win probability 🟢

popular chess sites and Lichess both use the same logistic. popular chess sites's published expression is
`Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)`, which simplifies exactly to:

```
winPctWhite(cpWhite) = 100 / (1 + exp(-0.00368208 * cpWhite))
```

**Do not change the constant `0.00368208`.** It is the calibration of the whole accuracy scale.

Reference values (use as unit tests):

| cp (White POV) | Win% White |
|---:|---:|
| 0 | 50.00 |
| 25 | 52.30 |
| 50 | 54.59 |
| 100 | 59.10 |
| 150 | 63.47 |
| 200 | 67.62 |
| 300 | 75.11 |
| 500 | 86.31 |
| 800 | 95.01 |
| 1000 | 97.54 |
| 2000 | 99.94 |

Per-colour view:

```
winPctFor(color, cpWhite):
  w = winPctWhite(cpWhite)
  return color === 'white' ? w : 100 - w
```

### 2.3 Building the win% series

For a game of `N` plies there are `N + 1` positions. Position `i` is the position **before** ply `i` (0-indexed), position `N` is the final position.

```
wp[i] = winPctWhite(toCpWhite(analysis[i].eval))   for i in 0..N
```

**Critical:** `analysis[i].eval` must be the engine's evaluation of the position **as reached in the game**, at the same depth as every other position — not the eval of the PV of the previous position. The pipeline already analyses each position independently, so this holds; just don't substitute `lines[0].cp` of position `i-1` for `wp[i]`.

### 2.4 Per-move win% drop

For the ply `i` played by `mover`:

```
before = winPctFor(mover, cpWhite[i])
after  = winPctFor(mover, cpWhite[i+1])
drop   = max(0, before - after)
```

`drop` is the single number that drives accuracy **and** classification. Clamping at 0 means a move that the engine underestimated (eval goes *up*) is simply 100% accurate, never above.

---

## 3. Per-move accuracy 🟢

This is the only formula popular chess sites has published verbatim:

```
moveAccuracy(drop) = clamp(103.1668 * exp(-0.04354 * drop) - 3.1669, 0, 100)
```

Reference values (unit tests — match to 2 decimals):

| drop (win% pts) | accuracy |
|---:|---:|
| 0 | 100.00 |
| 1 | 95.60 |
| 2 | 91.39 |
| 5 | 79.82 |
| 10 | 63.58 |
| 15 | 50.53 |
| 20 | 40.02 |
| 30 | 24.77 |
| 50 | 8.55 |
| 70 | 0.00 (clamped) |

Note the shape: the curve is brutal early and forgiving late. A 5-point win% drop already costs 20 accuracy points. This is why popular chess sites accuracies cluster in the 70–95 band for club players.

---

## 4. Game accuracy aggregation (CAPS-style) 🟡

**popular chess sites does not use a plain average of move accuracies.** A plain mean scores a game with 39 perfect moves and 1 catastrophe at ~97%, which popular chess sites would report as ~85%. The reconstruction below reproduces popular chess sites's published game accuracies closely across large samples.

The aggregate is the mean of two different means:

### 4.1 Volatility weights

Positions where the evaluation is swinging count for more than dead-drawn shuffling.

```
windowSize = clamp(ceil((N + 1) / 10), 2, 8)

for each ply i played by the target colour:
  lo = max(0, i - windowSize + 1)
  hi = min(N, i + 1)
  window = wp[lo .. hi]                  // White-POV win%, inclusive
  weight[i] = clamp(stdev(window), 0.5, 12.0)
```

`stdev` = population standard deviation. The `[0.5, 12]` clamp prevents both zero-weight quiet phases and a single wild swing dominating the game.

### 4.2 The two means

```
accs    = [moveAccuracy(drop_i) for each ply i by this colour]
weights = [weight[i] ...]

weightedMean = sum(accs[k] * weights[k]) / sum(weights)

harmonicMean = accs.length / sum(1 / max(accs[k], 1e-3))
```

The harmonic mean is what punishes blunders — one value near 0 drags the whole thing down. The weighted mean restores fairness for genuinely quiet games.

### 4.3 Final

```
gameAccuracy = clamp((weightedMean + harmonicMean) / 2, 0, 100)
report with 1 decimal
```

### 4.4 Edge cases

- **Fewer than 2 moves by a colour:** report the single move accuracy, or `null` for 0 moves.
- **Book moves:** popular chess sites counts book moves in accuracy at 100% (they are by definition best-known-theory). Include them with `drop = 0` unless the engine says the book move loses ≥10 win% — in that case use the real drop.
- **Forced moves (1 legal move):** include with `drop` as computed. Do **not** exclude them; popular chess sites includes them, which is why forcing sequences inflate accuracy. This is a known and intended property.
- **Games ending by timeout/resignation:** analyse only plies actually played.

---

## 5. Move classification

popular chess sites's label set: `brilliant` (!!), `great` (!), `best`, `excellent`, `good`, `book`, `inaccuracy` (?!), `mistake` (?), `miss`, `blunder` (??), `forced`.

Thresholds are 🟡 for the severity tiers, 🔴 for Brilliant/Great/Miss (popular chess sites describes these only in prose).

### 5.1 Decision order — evaluate strictly top to bottom, first match wins

```
1. book        → in opening book AND no side has left book yet
2. forced      → legalMoveCount === 1
3. brilliant   → §5.5
4. great       → §5.6
5. best        → playedMoveSan === analysis[i].bestMove
6. severity tier by drop (§5.2, §5.3)
7. miss re-label (§5.8) — can override inaccuracy/mistake/blunder
```

Brilliant and Great are checked **before** Best because a brilliant move is almost always also the engine's top move.

### 5.2 Base severity tiers 🟡

```
drop <  2   → excellent
drop <  5   → good
drop < 10   → inaccuracy
drop < 20   → mistake
drop >= 20  → blunder
```

(`best` already consumed the exact-top-move case above, so `excellent` means "not the top move but effectively equivalent".)

### 5.3 Position-dependent damping 🟡 — this is what makes it feel like popular chess sites

popular chess sites does not flag a blunder when you go from +9.0 to +4.0. You are still completely winning; nothing was actually lost. Apply after computing the base tier:

```
// still totally winning → cannot be worse than inaccuracy
if (beforeWin >= 90 && afterWin >= 90)
    severity = min(severity, INACCURACY)

// already totally lost → cannot be worse than inaccuracy
if (beforeWin <= 10 && afterWin <= 10)
    severity = min(severity, INACCURACY)

// dead-drawn technical positions (both sides 45-55 for the whole window)
// → cap at 'good' when |cpBefore| < 30 and |cpAfter| < 30
```

Severity ordering for `min`: `excellent < good < inaccuracy < mistake < blunder`.

Without this rule your classifier will over-report blunders in won games and users will immediately notice the divergence from popular chess sites.

### 5.4 Optional refinement: the "band crossing" rule 🔴

A stricter version of §5.3 that matches popular chess sites even more closely. Map win% to a result band:

| Band | Win% |
|---|---|
| `losing` | 0–10 |
| `worse` | 10–30 |
| `slightly worse` | 30–45 |
| `equal` | 45–55 |
| `slightly better` | 55–70 |
| `better` | 70–90 |
| `winning` | 90–100 |

```
bandsCrossed = |bandIndex(before) - bandIndex(after)|
severity = min(severity, severityFromBands(bandsCrossed))
  where 0 → good, 1 → inaccuracy, 2 → mistake, >=3 → blunder
```

Use §5.3 as the baseline; enable §5.4 behind a flag and compare against real Game Reports during calibration.

### 5.5 Brilliant (!!) 🔴

popular chess sites's prose definition: *a good sacrifice that is not obvious, in a position that is not already completely winning or completely lost.* popular chess sites tightened this in 2024 — brilliants became noticeably rarer. Target rarity: **< 1 in 60 games** for a 1200-rated player. If your implementation produces more, it is wrong; tighten the sacrifice test first.

All of the following must hold:

```
B1  label is not 'book' and legalMoveCount > 1
B2  drop <= 2                        // the move must actually be good
B3  afterWin >= 30                   // not losing after
B4  beforeWin <= 92                  // not already trivially winning
B5  SACRIFICE:
      let worstSee = seeOnAllOpponentCaptures(fenAfter, mover)
      require worstSee <= -180        // at least a minor piece lost on the exchange
    OR
      the move itself was a capture whose SEE for the mover <= -180
      (e.g. QxN into a recapture)
B6  SOUNDNESS: after the opponent's best reply (engine, same depth),
      winPctFor(mover) >= beforeWin - 3
    // i.e. the sacrifice is not just "engine says fine because opponent must decline"
B7  NON-OBVIOUSNESS: there exists a legal non-sacrificial alternative move
      whose eval is >= 100cp worse for the mover than the played move.
      // if a quiet move achieves the same thing, it isn't brilliant
B8  the sacrificed material is not regained within the PV's first 2 plies
      by an immediate tactic that any engine-free player would see
      (approximate: PV[1..2] must not contain a capture that restores
       >= 80% of the sacrificed value)
```

Rejected cases to unit-test: recaptures, exchange sacs that immediately win the piece back, "sacrifices" in positions already at +8, desperado moves in lost positions, and any move where the piece is defended (SEE ≥ 0).

**Special case popular chess sites allows:** a sacrifice that turns a *lost* position into a draw is brilliant. Relax `B4`/`B3` when `beforeWin <= 15 && afterWin >= 40`.

### 5.6 Great (!) 🔴

*The move was the only good move, or it was decisively better than every alternative.* Target rarity: ~1 per 3–4 games.

```
G1  not brilliant, not book, legalMoveCount > 1
G2  playedMove === bestMove  (or drop <= 1)
G3  UNIQUENESS:
      gap = |winPctFor(mover, lines[0]) - winPctFor(mover, lines[1])|
      require gap >= 10        // second-best is 10 win-points worse
G4  MATERIALITY: at least one of
      - the move changes result band in the mover's favour (§5.4)
      - the move is the only move avoiding a band drop of >= 2
      - the move enters a forced mate that no other move enters
```

`G3` needs MultiPV ≥ 2, which the pipeline already provides (MultiPV 3). If MultiPV data is missing for a position, Great cannot be awarded — fail closed.

### 5.7 Excellent / Good / Book

- **Book**: FEN before the move exists in the opening book and the played move is a book continuation. Once either side plays a non-book move, book is permanently off for the rest of the game.
- **Excellent / Good**: from §5.2 after damping. No extra conditions.

### 5.8 Miss 🔴

A `Miss` is not a separate severity — it is a **re-label** of an `inaccuracy`/`mistake`/`blunder` that specifically means *"you failed to punish"*. Applied last:

```
M1  current severity is inaccuracy, mistake, or blunder
M2  an opportunity existed before the move:
      bestWin = winPctFor(mover, toCpWhite(lines[0]))
      require (lines[0].mateIn != null && sign matches mover)
              OR bestWin >= 75
M3  the opportunity was thrown away:
      afterWin <= bestWin - 15
      OR (mate was available before and no mate after)
M4  optional context signal, raises confidence:
      the opponent's previous move was classified mistake/blunder/miss
      OR features.forks / features.hangingPieces / features.captureOpportunities
         was non-empty for the mover before this move
```

`M4` is exactly where the existing feature bag pays off — `hangingPieces`, `forks`, `targetsAttacked` and `captureOpportunities` let the UI say *"you missed the fork on e5"* rather than just *"Miss"*.

### 5.9 Reported counts

The user asked specifically for Inaccuracies / Mistakes / Blunders. Report per colour:

```ts
interface ClassificationCounts {
  brilliant: number; great: number; best: number; excellent: number;
  good: number; book: number; inaccuracy: number; mistake: number;
  miss: number; blunder: number; forced: number;
}
```

`miss` is counted **in addition to** — not instead of — nothing; a Miss move is counted only under `miss`, and its underlying severity is kept in a separate field `underlyingSeverity` for the accuracy math (accuracy always uses the raw `drop`, never the label).

---

## 6. Phase segmentation 🟡 / 🔴

### 6.1 Opening → Middlegame boundary 🟡

```
openingEndPly =
   lastBookPly                    if lastBookPly >= 8
   else 10                        // fallback: 5 full moves
   capped at 30                   // never let "opening" run past move 15
```

If no opening book is available at all, use the fallback constant and mark `openingSource: 'heuristic'` in the output so the UI can soften the wording.

### 6.2 Middlegame → Endgame boundary 🔴

Use phase units, not raw material:

```
phaseUnits(fen) = sum over both sides of: N=1, B=1, R=2, Q=4
// starting position = 24
```

```
endgameStartPly = first ply p where phaseUnits(position[p]) <= 10
                  (monotone — once endgame, always endgame)
```

Sanity checks this rule produces:
- Q vs Q (8) → endgame ✓
- R+R vs R+R (8) → endgame ✓
- R+R+N vs R+R+N (10) → endgame ✓
- Q+R vs Q+R (12) → still middlegame ✓
- Q+N vs Q+N (10) → endgame ✓

Threshold `10` is the main tuning knob for "does this feel like popular chess sites's split". Keep it in config.

### 6.3 Guards

- `endgameStartPly` must be `> openingEndPly`; if material vanishes inside the book, force `endgameStartPly = openingEndPly + 1`.
- A phase with **zero moves for a colour** reports `null`, not `0`. popular chess sites hides the row entirely in that case.
- A phase with **1–2 moves** should be reported with a `lowConfidence: true` flag — a single move phase accuracy is meaningless and will look absurd next to popular chess sites.

### 6.4 Phase accuracy

Identical to §4, restricted to the plies of that phase, **but weights are computed from the full-game win% series** (§4.1), not recomputed within the phase. Recomputing per-phase changes the standard deviations and desynchronises the phase numbers from the game number.

```
phaseAccuracy(colour, phase) =
    (weightedMean(accs_in_phase, weights_from_full_game)
     + harmonicMean(accs_in_phase)) / 2
```

Note: the three phase accuracies will **not** average to the game accuracy. That is expected and is also true on popular chess sites.

---

## 7. Opening / Tactics / Strategy scores 🔴

Nothing here is published. These formulas are designed to (a) land on a 0–100 scale that reads like accuracy, (b) be explainable move-by-move in the UI, and (c) use the feature bag the pipeline already produces. **All weights below are calibration targets, not truths.**

Design rule for all three: **score = accuracy on a relevant subset, adjusted by domain-specific evidence.** This keeps the numbers commensurable with the headline accuracy, which is what users expect.

### 7.1 Opening score

```
openingAccuracy   = phaseAccuracy(colour, 'opening')            // §6.4
bookDepthScore    = clamp(100 * lastBookPlyForColour / 16, 0, 100)
                    // 8 full moves of theory = 100

developmentScore  = evaluated at openingEndPly:
    +25  castled (or king safe & rook connected)
    +10  per developed minor piece off its home square (max 40)
    +15  centreControlScore[colour] >= centreControlScore[opp]
    +10  no piece moved twice in the opening without cause
    +10  no more than one pawn move beyond the necessary
    clamp 0..100

openingScore = 0.55 * openingAccuracy
             + 0.20 * bookDepthScore
             + 0.25 * developmentScore
```

`centerControlScore` and `controlledSquares` already exist in the feature bag; `piece moved twice` is derivable from the move list.

### 7.2 Tactics score

First partition the game's plies into **tactical** and **quiet**.

```
isTacticalPosition(analysis, mover) = ANY of:
  - lines[0].mateIn != null
  - |winPctFor(mover, lines[0]) - winPctFor(mover, lines[1])| >= 8
  - features.hangingPieces is non-empty for either side
  - features.forks is non-empty
  - features.captureOpportunities contains an entry with SEE > 0
  - features.piecesUnderAttack contains an entry where attackers > defenders
  - the best move is a check or a capture with SEE >= 0
```

```
tacticalAccuracy = accuracyAggregate(accs of mover's moves in tactical positions)
                   // §4 machinery, weights from full-game series

tacticalEvidence  = 0
  + 6  per brilliant
  + 3  per great
  + 1.5 per best move played in a tactical position
  - 4  per miss
  - 3  per blunder in a tactical position
  - 1.5 per mistake in a tactical position
  - 2  per move that created a new hanging piece
       (delta.newHangingPieces non-empty)
  - 2  per move that allowed a new opponent fork
       (delta.newForks non-empty, opponent's colour)

tacticsScore = clamp(tacticalAccuracy + clamp(tacticalEvidence, -15, +15), 0, 100)
```

If the game contained **fewer than 4 tactical positions** for this colour, return `null` with `reason: 'insufficient tactical positions'`. A tactics score from one position is noise.

The `delta` block already emitted per move (`newForks`, `newHangingPieces`, `mobilityDelta`) is exactly the right input here — no new engine work needed.

### 7.3 Strategy score

The complement: quiet positions plus positional trend.

```
quietAccuracy = accuracyAggregate(accs of mover's moves in NON-tactical positions)

positionalTrend, measured as the change in the mover's structural standing
between openingEndPly and the final position (or the last ply before the
position becomes tactically decided):

  pawnStructure  = -8 * Δ(own doubledPawns)
                   -8 * Δ(own isolatedPawns)
                   +10 * Δ(own passedPawns)
  space          = +0.4 * mean(mobilityDelta over the colour's quiet moves)
  files          = +6 * Δ(own major pieces on open/semiOpenFiles)
  centre         = +5 * Δ(centerControlScore[colour] - centerControlScore[opp])
  kingSafety     = -10 if own king's escape squares trend downward while
                   the opponent has >= 2 attackers near it

positionalTrend = clamp(sum of the above, -15, +15)

strategyScore = clamp(quietAccuracy + positionalTrend, 0, 100)
```

Every input above (`doubledPawns`, `isolatedPawns`, `passedPawns`, `mobility`, `openFiles`, `semiOpenFiles`, `centerControlScore`, `controlledSquares`) is already in the feature bag.

Same guard: fewer than 4 quiet positions → `null`.

### 7.4 Endgame score (add it — the set feels incomplete without it)

```
endgameScore = 0.7 * phaseAccuracy(colour, 'endgame')
             + 0.3 * conversionScore

conversionScore:
  if the colour was winning (win% >= 75) at endgameStartPly:
      100 if the game was won, 40 if drawn, 0 if lost
  if roughly equal (45..75):
      100 if won, 75 if drawn, 35 if lost
  if worse (< 45):
      100 if won, 90 if drawn, 60 if lost
```

Return `null` if the game never reached the endgame phase.

---

## 8. Estimated rating from a single game 🔴

### 8.1 Honest framing for the UI

A single game estimates rating with a standard error of roughly **±250 Elo**. popular chess sites's own per-game estimate is a trained model over their player base, not a formula. Ship a **range**, not a point estimate, or users will compare it against their real rating and lose trust immediately.

### 8.2 Step 1 — raw accuracy → Elo anchor

Piecewise-linear interpolation over an anchor table. These anchors approximate observed mean accuracy by rating band in rapid/blitz:

| Accuracy | Elo |
|---:|---:|
| 40 | 250 |
| 50 | 450 |
| 60 | 750 |
| 65 | 950 |
| 70 | 1150 |
| 75 | 1380 |
| 80 | 1620 |
| 84 | 1870 |
| 88 | 2120 |
| 91 | 2360 |
| 94 | 2620 |
| 97 | 2900 |
| 99 | 3100 |

Clamp to `[100, 3200]`. Linear interpolation between anchors; flat extrapolation outside.

### 8.3 Step 2 — error-rate cross-check

Accuracy alone is gameable by quiet games. Cross-check with per-100-move error rates:

```
movesPlayed = number of the colour's non-book moves
per100(x)   = 100 * x / max(movesPlayed, 1)

errorRating = 2600
            - 26 * per100(inaccuracies)
            - 55 * per100(mistakes)
            - 95 * per100(blunders + misses)
clamp to [100, 3200]
```

```
raw = 0.65 * accuracyRating + 0.35 * errorRating
```

### 8.4 Step 3 — complexity adjustment

A game that was never sharp gives inflated accuracy.

```
meanVolatility = mean(weight[i]) over the colour's moves   // §4.1, in [0.5, 12]
complexity     = clamp(meanVolatility / 4, 0.5, 1.5)

// low-complexity games get pulled toward the prior harder
```

### 8.5 Step 4 — shrink toward a prior

```
prior      = the player's known rating if available, else 1200
nEff       = movesPlayed * complexity
k          = 14
estimate   = (nEff * raw + k * prior) / (nEff + k)

stdErr     = 260 / sqrt(max(nEff, 1) / 10)      // ≈ ±250 for a 30-move game
range      = [estimate - stdErr, estimate + stdErr]
```

Round the estimate to the nearest 25. Return `null` (with `reason`) when `movesPlayed < 12` — a 10-move miniature carries no rating signal.

### 8.6 Guard rails

- Cap the estimate at `prior + 600` when a prior exists. Without this, a 15-move game where the opponent hangs a queen produces "your play was 2800", which is worse than useless.
- If the game contains a forced sequence longer than 8 plies, subtract those plies from `movesPlayed`.

---

## 9. Output schema

```ts
interface GameReport {
  engine: { name: string; depth: number; multiPv: number };
  book:   { source: string; lastBookPly: number; eco?: string; name?: string };
  phases: {
    openingEndPly: number;
    endgameStartPly: number | null;
    openingSource: 'book' | 'heuristic';
  };
  players: Record<'white' | 'black', PlayerReport>;
  moves: MoveReport[];
}

interface PlayerReport {
  accuracy: number;                        // §4, 1 decimal
  phaseAccuracy: {
    opening: number | null;
    middlegame: number | null;
    endgame: number | null;
  };
  phaseConfidence: Record<'opening'|'middlegame'|'endgame', 'ok'|'low'|'none'>;
  scores: {
    opening: number | null;
    tactics: number | null;
    strategy: number | null;
    endgame: number | null;
  };
  counts: ClassificationCounts;
  acpl: number;                            // mean centipawn loss, capped per move at 1000
  estimatedRating: {
    value: number | null;
    range: [number, number] | null;
    confidence: 'low' | 'medium';
    reason?: string;
  };
}

interface MoveReport {
  ply: number;
  moveNumber: number;
  color: 'white' | 'black';
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  cpBefore: number;                        // White POV
  cpAfter: number;                         // White POV
  winPctBefore: number;                    // mover POV
  winPctAfter: number;                     // mover POV
  drop: number;
  accuracy: number;
  classification: Classification;
  underlyingSeverity?: Classification;     // set when classification === 'miss'
  phase: 'opening' | 'middlegame' | 'endgame';
  isTacticalPosition: boolean;
  bestMoveSan: string;
  bestLinePvSan: string[];
  alternatives: { san: string; cp: number; winPct: number }[];
  reasons: string[];                       // human-readable, see §11
}
```

---

## 10. Calibration procedure (do not skip)

The 🔴 sections are guesses until they are fitted. Procedure:

1. **Collect ground truth.** Pull 200–500 games that already have a popular chess sites Game Review, spanning 800–2200 rating. Record their reported accuracy, phase accuracies, and classification counts.
2. **Fix the engine first.** Run your pipeline at several depths (14, 16, 18, 20) and pick the depth whose *game accuracy* residual against popular chess sites is smallest and least biased. Expect depth to matter more than any constant in this document.
3. **Validate §2–§4 exactly.** If game accuracy is not within ±1.5 points on 80% of games, the bug is in the win% series, the sign convention (§1.2), or the weights — **not** in the accuracy curve. Do not tune 🟢/🟡 constants to compensate for an upstream bug.
4. **Fit classification thresholds.** Grid-search the §5.2 tier boundaries and the §5.3 damping cutoffs to minimise total mislabelled moves. Expect the damping rule to be worth more than the tier boundaries.
5. **Fit Brilliant/Great by rarity, not by matching.** Adjust `B5`'s SEE threshold and `G3`'s gap until per-1000-move frequency matches popular chess sites's. Exact per-move agreement is not achievable.
6. **Fit the rating anchors last**, by regressing your estimate against the players' actual ratings at the time of the game.

Keep every constant in one exported config object so recalibration is a data change, not a code change.

---

## 11. Rendering guidance (the actual point of this)

The stated priority is presentation, not the numbers. The per-move `reasons: string[]` field is where the existing feature bag earns its keep. Generate reasons deterministically from data already present — never from the LLM at render time:

| Trigger | Reason string |
|---|---|
| `delta.newHangingPieces` non-empty | "Leaves the {piece} on {square} undefended" |
| `delta.newForks` for opponent | "Allows {piece} fork on {square} hitting {targets}" |
| `delta.mobilityDelta <= -8` | "Costs {n} squares of piece mobility" |
| best move was a capture with SEE > 0, not played | "Missed {bestMove}, winning material on {square}" |
| `lines[0].mateIn != null`, not played | "Missed mate in {n} starting with {bestMove}" |
| `piecesUnderAttack` where attackers > defenders, unresolved | "Leaves {piece} on {square} attacked {a}× and defended {d}×" |
| `centerControlScore` swing ≥ 3 against mover | "Concedes the centre" |
| new `passedPawns` for mover | "Creates a passed pawn on {file}" |
| move is `book` | "Theory — {openingName} ({eco})" |

Ordering rule for the UI: show at most **two** reasons per move, prioritising `mate > material > tactical motif > structural > mobility`. More than two reads as noise.

For the alternatives panel, the existing MultiPV-3 output is already the right shape: show `bestMoveSan` with its PV, plus the two runners-up with their win% (not raw centipawns — win% is what the accuracy number is built on, and it is far more intuitive for club players).

---

## 12. Opening book: dataset, index build, and report fields 🟡

### 12.1 Dataset

**Primary source: `lichess-org/chess-openings`** — https://github.com/lichess-org/chess-openings

- ~3,500 named openings across ECO volumes A–E, one row per named line.
- **License: CC0 public domain.** Safe for commercial use, no attribution obligation (attribution is still polite).
- Files: `a.tsv`, `b.tsv`, `c.tsv`, `d.tsv`, `e.tsv`, split by ECO volume.

**⚠️ The repo-root TSVs contain only `eco`, `name`, `pgn`.** The `uci` and `epd` columns exist only in the generated `dist/` build. Three ways to get them:

1. Run the build yourself: `pip3 install chess && make` in a clone. Reproducible, pins to a commit.
2. Download the artifact from the latest GitHub Actions workflow run.
3. Skip it — derive UCI and EPD yourself with `chess.js` while building the index (§12.2). You have to walk the PGN anyway to get intermediate positions, so this is the least work overall.

**Mirrors** (same data, different packaging):
- Hugging Face `Lichess/chess-openings` — Parquet, includes `eco-volume`. ⚠️ It also carries a rendered board `img` column that inflates the download to ~215 MB. Select columns before downloading.
- Kaggle `lichess/chess-openings` — same content, CSV/Parquet.

**Optional enrichment: `hayatbiralem/eco.json`** — merges the Lichess TSVs (treated as authoritative) with SCID, Wikipedia and other name sources, plus interpolated intermediate variations. Useful if you want richer naming or SCID aliases for the educational side. Not needed for the Book label.

**Pin the version.** Opening names in this dataset change between releases. Store the commit SHA or release date alongside the generated index and surface it in the report (`book.source`), or a game re-analysed six months later will silently report a different opening name.

### 12.2 Index build

The dataset gives *named terminal positions*, not a book. One offline build step turns it into both.

```
INPUT:  rows of { eco, ecoVolume, name, pgn }
OUTPUT: bookIndex: Map<PositionKey, BookEntry[]>
        nameIndex: Map<PositionKey, { eco, ecoVolume, name, ply }>

for each row:
  board = new Chess()
  plies = parseSanSequence(row.pgn)
  for (i = 0; i < plies.length; i++):
      key = positionKey(board.fen())          // BEFORE the move
      upsert bookIndex[key] with {
        san:  plies[i].san,
        uci:  plies[i].uci,
        eco:  row.eco,
        name: row.name
      }                                        // dedupe by san
      board.move(plies[i])
  // terminal position only
  terminalKey = positionKey(board.fen())
  if (!nameIndex.has(terminalKey) || plies.length > nameIndex.get(terminalKey).ply)
      nameIndex[terminalKey] = { eco, ecoVolume, name, ply: plies.length }
```

Expect roughly 42k position-move pairs before dedupe, ~18k unique positions after. Serialize as JSON; ship it as a static asset and load once at boot.

**Do not cap the build at 24 plies.** A handful of named lines run deeper, and dropping them costs nothing to keep. The 24-ply constraint from earlier applies to *runtime* lookup, not to the index.

### 12.3 `positionKey` — the one function that must be exactly right

The dataset's `epd` field is documented as *FEN without move numbers, en passant field only if legal*. Your key generator must match that rule byte-for-byte, or lookups will miss sporadically and only for positions that follow a pawn double-push — which is most of them, in the opening.

```
positionKey(fullFen):
  [placement, sideToMove, castling, epSquare] = fullFen.split(' ')   // drop halfmove, fullmove
  if (epSquare !== '-'):
      // chess.js sets the ep square after any pawn double-push,
      // whether or not a capture is actually available.
      // EPD only sets it when the capture is legal.
      const legal = new Chess(fullFen).moves({ verbose: true })
                      .some(m => m.flags.includes('e'))
      if (!legal) epSquare = '-'
  return [placement, sideToMove, castling, epSquare].join(' ')
```

Verify the chess.js version's behaviour in a test rather than trusting the comment above — the en-passant convention has changed across major versions. Test vector: after `1.e4 e5 2.Nf3 Nc6 3.d4`, the key must end in `-`, not `d3`.

Keying by position rather than move sequence is what makes transpositions resolve for free: `1.Nf3 d5 2.d4 Nf6 3.c4` and the QGD move order produce the same key and the same name.

### 12.4 Runtime: book detection

```
inBook = true
lastBookPly = { white: 0, black: 0 }

for each ply p:
  if (!inBook) break
  entries = bookIndex.get(positionKey(fenBefore[p]))
  if (entries && entries.some(e => e.san === playedSan)):
      move[p].classification = 'book'
      lastBookPly[colour(p)] = p + 1
  else:
      inBook = false
      leftBook[colour(p)] = {
        ply: p,
        played: playedSan,
        alternatives: entries ? entries.map(e => e.san) : []
      }
```

Once either side leaves book, book is off permanently for both. `lastBookPly` (max over both colours) feeds `openingEndPly` in §6.1; the per-colour value feeds `bookDepthScore` in §7.1.

### 12.5 Runtime: opening name

**Deepest match wins.** Lichess's own recommendation is to play the moves backwards until a named position is found, which is the same rule.

```
resolveOpening(positionKeys):
  for (i = min(positionKeys.length - 1, 30); i >= 0; i--):
      hit = nameIndex.get(positionKeys[i])
      if (hit) return { ...hit, ply: i }
  return null
```

First-match-wins is badly wrong here: many rows are only 2–3 plies deep, so every Sicilian would report as "Sicilian Defense" instead of "Sicilian Defense: Najdorf Variation, English Attack".

Names are structured `Family: Variation, Subvariation`. Split on `': '` to get a family for grouping and a variation for display.

### 12.6 Known limitations

- **ECO codes are not unique** — many openings share one code, and one opening family can span codes (Sicilian appears under both B23 and C10). Group by *name family* for repertoire stats, never by ECO code.
- **A name-based book is narrower than popular chess sites's**, which is frequency-derived from played games. Sound but unnamed sidelines are not in your book, so `lastBookPly` cuts slightly earlier and the opening phase ends slightly sooner than popular chess sites's. Bounded, acceptable, and additively fixable later by merging a frequency layer (Lichess masters explorer, positions with ≥ 20 games, ≤ 24 plies) into the same `bookIndex`.
- **Multiple entries exist per opening** deliberately, to cover common transpositions. Dedupe by `san` within a position key, not by name.

### 12.7 Report fields to add

```ts
interface BookReport {
  source: string;              // e.g. "lichess-org/chess-openings@<sha>"
  eco: string | null;
  ecoVolume: 'A'|'B'|'C'|'D'|'E' | null;
  name: string | null;         // deepest match
  family: string | null;       // text before ': '
  variation: string | null;    // text after ': '
  namedAtPly: number | null;
  lastBookPly: number;         // max over both colours
}

// per player, inside PlayerReport:
interface PlayerBookReport {
  lastBookPly: number;
  leftBookPly: number | null;
  leftBookMove: string | null;      // what they actually played
  bookAlternatives: string[];       // theory moves available at that position
}
```

`leftBookMove` + `bookAlternatives` is the highest-value pair on this list. It turns the opening section from a score into a lesson: *"You left the Alapin at move 6 with Bd3; theory plays Bb5+ or d4."* Cheap — it falls out of the same walk that produces the Book labels, with no extra engine work.

Aggregated across a player's games, `family` + phase accuracy + `leftBookPly` gives a repertoire view (which systems they play, accuracy per family, where they consistently fall out of theory). That is far better context for a coach prompt than a bare FEN, because it lets the coach reason about the student's system rather than a single position.

---

## 13. Implementation checklist

- [ ] Assert eval sign convention at ingest (§1.2)
- [ ] SEE implementation with unit tests on known exchange sequences
- [ ] Opening book index built per §12.2, dataset version pinned
- [ ] `positionKey` en-passant normalization tested against the §12.3 vector
- [ ] Opening name resolved by deepest match, not first match
- [ ] `winPctWhite` matching the reference table in §2.2 to 2 decimals
- [ ] `moveAccuracy` matching the reference table in §3 to 2 decimals
- [ ] Volatility weights with the `[0.5, 12]` clamp and `[2, 8]` window clamp
- [ ] Game accuracy = mean(weighted, harmonic)
- [ ] Classification decision order exactly as §5.1
- [ ] §5.3 damping applied — verify a +9.0 → +4.0 move is not a blunder
- [ ] Phase boundaries monotone and non-overlapping
- [ ] `null` (never `0`) for phases and scores with insufficient data
- [ ] Rating estimate returns a range and shrinks toward a prior
- [ ] All tunable constants in a single exported config object
- [ ] Deterministic: same PGN + same depth → byte-identical report