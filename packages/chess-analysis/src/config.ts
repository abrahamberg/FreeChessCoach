import { ENGINE_MULTI_PV } from '@freechesscoach/shared';
import type { PieceSymbol } from 'chess.js';

/**
 * Every tunable constant from algorith.md's §1-§8 formulas (Phases 12-18),
 * gathered so Phase 21's calibration pass is a data change here, not a code
 * change scattered across a dozen files. Board-geometry constants (file
 * letters, standard SEE piece values used for exchange arithmetic) and
 * fixed structural facts (a forced move has exactly one legal reply) stay
 * local to their modules — they aren't calibration knobs.
 */
export const CONFIG = {
  /** §1-2 — White-POV win% from a centipawn/mate score. */
  winProbability: {
    slope: 0.00368208,
    cpClamp: 2000,
    mateBase: 2000,
    mateDecayPerPly: 10,
    mateInClamp: 50
  },

  /** §3 — win% drop to 0-100 move accuracy. */
  accuracyCurve: {
    scale: 103.1668,
    decay: 0.04354,
    offset: 3.1669
  },

  /** §4 — CAPS-style per-game aggregation. */
  gameAccuracy: {
    minWindow: 2,
    maxWindow: 8,
    windowDivisor: 10,
    minWeight: 0.5,
    maxWeight: 12,
    bookDropOverrideThreshold: 10
  },

  /** §5.2/§5.3 — severity tiers and the dead-position damping guard. */
  severity: {
    excellentMaxDrop: 2,
    goodMaxDrop: 5,
    inaccuracyMaxDrop: 10,
    mistakeMaxDrop: 20,
    dampingHighWin: 90,
    dampingLowWin: 10,
    deadDrawWinLow: 45,
    deadDrawWinHigh: 55,
    deadDrawCpAbs: 30
  },

  /** Shared win% banding used by §5's Great/Miss materiality checks. */
  resultBand: {
    losingMax: 10,
    worseMax: 30,
    slightlyWorseMax: 45,
    equalMax: 55,
    slightlyBetterMax: 70,
    betterMax: 90
  },

  /** §5.6/§5.7 — Brilliant (B1-B8). */
  brilliant: {
    maxDrop: 2,
    lostToDrawBeforeWinMax: 15,
    lostToDrawAfterWinMin: 40,
    minAfterWin: 30,
    maxBeforeWin: 92,
    sacrificeSeeThreshold: -180,
    nonObviousAlternativeCpMargin: 100,
    restoredValueRatio: 0.8,
    /** Standard material values for "was the sacrifice restored" bookkeeping
     * — distinct from SEE's own table (`see.ts`), which values the king at
     * 20000 so it is never treated as capturable material. */
    pieceValues: { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 } satisfies Record<PieceSymbol, number>
  },

  /** §5.5 — Great (G1-G4). */
  great: {
    minGapWinPct: 10,
    topMoveDropTolerance: 1,
    materialityBandGap: 2
  },

  /** §5.8 — Miss (M1-M4) re-label. */
  miss: {
    opportunityWinPctMin: 75,
    threwAwayDropMin: 15
  },

  /** §6.1-§6.3 — phase segmentation. */
  phaseSegmentation: {
    openingFallbackPly: 10,
    openingMaxPly: 30,
    openingBookMinPly: 8,
    endgamePhaseUnitThreshold: 10,
    lowConfidenceMaxMoves: 2
  },

  /** §7.1 — opening score. */
  openingScore: {
    bookDepthFullScorePly: 16,
    castledBonus: 25,
    developedMinorBonusPerPiece: 10,
    maxDevelopedMinorBonus: 40,
    centerControlBonus: 15,
    noRepeatedMoveBonus: 10,
    noExcessPawnMoveBonus: 10,
    necessaryPawnMoves: 2,
    maxAllowedPawnMoves: 3,
    accuracyWeight: 0.55,
    bookDepthWeight: 0.2,
    developmentWeight: 0.25
  },

  /** §7.2 — tactics score. */
  tacticsScore: {
    evalGapThreshold: 8,
    minTacticalPositions: 4,
    brilliantBonus: 6,
    greatBonus: 3,
    bestInTacticalBonus: 1.5,
    missPenalty: -4,
    blunderInTacticalPenalty: -3,
    mistakeInTacticalPenalty: -1.5,
    newHangingPiecePenalty: -2,
    newOpponentForkPenalty: -2,
    evidenceClamp: 15
  },

  /** §7.3 — strategy score. */
  strategyScore: {
    minQuietPositions: 4,
    trendClamp: 15,
    doubledPawnWeight: -8,
    isolatedPawnWeight: -8,
    passedPawnWeight: 10,
    spaceWeight: 0.4,
    openFileWeight: 6,
    centerWeight: 5,
    kingSafetyPenalty: -10,
    kingSafetyAttackerThreshold: 2,
    /** Mirrors kingSafetyPenalty's magnitude for the "Attacking Accuracy"
     * sub-score (Phase 25) — the same escape-square/attacker-pressure
     * signal evaluated against the opponent's king instead of the mover's
     * own, rewarded rather than penalized. */
    attackingBonus: 10
  },

  /** §7.4 — endgame score. */
  endgameScore: {
    winningThreshold: 75,
    equalThreshold: 45,
    conversionTable: {
      winning: { win: 100, draw: 40, loss: 0 },
      equal: { win: 100, draw: 75, loss: 35 },
      worse: { win: 100, draw: 90, loss: 60 }
    },
    accuracyWeight: 0.7,
    conversionWeight: 0.3
  },

  /** §8.2-§8.6 — rating estimation. */
  ratingEstimate: {
    ratingMin: 100,
    ratingMax: 3200,
    accuracyEloAnchors: [
      [40, 250],
      [50, 450],
      [60, 750],
      [65, 950],
      [70, 1150],
      [75, 1380],
      [80, 1620],
      [84, 1870],
      [88, 2120],
      [91, 2360],
      [94, 2620],
      [97, 2900],
      [99, 3100]
    ] as ReadonlyArray<readonly [number, number]>,
    inaccuracyWeight: 26,
    mistakeWeight: 55,
    blunderOrMissWeight: 95,
    errorRatingBase: 2600,
    accuracyRatingWeight: 0.65,
    errorRatingWeight: 0.35,
    complexityDivisor: 4,
    minComplexity: 0.5,
    maxComplexity: 1.5,
    forcedSequenceMinLength: 8,
    shrinkK: 14,
    minMovesPlayed: 12,
    defaultPrior: 1200,
    priorCapMargin: 600,
    stdErrBase: 260,
    stdErrNEffDivisor: 10,
    roundToNearest: 25,
    /** Not from algorith.md directly — the report's `confidence` field needs
     * some threshold, and doubling the §8.6 minimum is the least arbitrary
     * choice available until Phase 21 calibrates against real data. */
    mediumConfidenceMinMoves: 24
  },

  /** §11 — deterministic per-move coaching reasons. */
  moveReasons: {
    maxReasons: 2,
    centerSwingThreshold: 3,
    mobilityDropThreshold: -8
  },

  /** §5 layer 2 of docs/tactics-rework.md — the gate that turns "does this
   * shape exist on the board?" into "does this shape win something?".
   * `minStaticGainPawns` is the smallest material edge a static claim has to
   * show before it earns a sentence (a pawn); `minLineGainPawns` is the
   * larger bar a claim must clear inside the engine's own continuation,
   * where an exchange that merely comes out level would otherwise register.
   * `minWinProbabilitySwing` is the positional rung for motifs where no
   * material changes hands (a pin that binds, an overload) — win% points, the
   * same scale `CONFIG.severity` uses. `maxLinePlies` bounds the PV walk at
   * §5's own 4-8. The confidence cut-offs are §3 rule 2's three specificity
   * levels: squares at high, the bare motif at medium, silence below. */
  tacticVerification: {
    minStaticGainPawns: 1,
    minLineGainPawns: 1.5,
    /** How far apart two claims' verified gains may sit and still count as
     * winning the same thing (`played-tactic-alternative.ts`). A pin walked
     * through the engine's line and a fork priced by SEE both "win a queen"
     * and report 6.0 and 5.8 for it; without slack, which of two ways to win
     * the same queen the card names would turn on that rounding. A pawn is
     * comfortably below the gap between any two actual prizes. */
    equalPrizeTolerancePawns: 1,
    minWinProbabilitySwing: 8,
    maxLinePlies: 8,
    highConfidence: 0.7,
    mediumConfidence: 0.4
  },

  /** §5 layer 5 of docs/tactics-rework.md — the game-level note measured
   * against this player's own history. `minBaselineGames`/`minBaselineChances`
   * are the floor below which there is no history worth comparing to, so no
   * note is made rather than a note made out of two games. `noteworthyGap` is
   * how far this game's rate has to sit from the player's usual one before it
   * is worth a sentence, and `habitBaselineRate` is where the tone stops
   * being "unusual for you" and starts being the thing to train. All rates,
   * not counts. */
  tacticBaseline: {
    minBaselineGames: 4,
    minBaselineChances: 6,
    noteworthyGap: 0.25,
    habitBaselineRate: 0.5
  },

  /** Both-sides tactic scanning (scan-tactics-for-lines.ts / position-tactics.ts).
   * `defaultTopN` is `ENGINE_MULTI_PV` itself (from @freechesscoach/shared,
   * the canonical single source) — no more hand-synced duplicate literal. */
  tacticScan: {
    defaultTopN: ENGINE_MULTI_PV
  },

  /** §4.5/DQ-05 — human-reachability scoring (Task 54.1). Four independent
   * [0,1] sub-scores blended by weight (summing to 1, so a move maxing out
   * every input scores exactly 1): the required move's multiPv rank, its
   * forcing-ness, the PV length the student must see through, and how
   * obvious its material gain is by SEE. `dq05Threshold` is where §II.A's
   * DQ-05 gate ("suggested improvement is not human-reachable") fires —
   * below it, an opportunity is engine-only and must not be reported as a
   * student failure (§4.4). */
  humanReachability: {
    rankWeight: 0.3,
    forcingWeight: 0.3,
    lengthWeight: 0.25,
    seeWeight: 0.15,
    /** SEE centipawn gain treated as maximally "obvious" — roughly a minor
     * piece, since winning that much material or more is easy to spot
     * regardless of the position's subtlety. */
    seeGainScale: 300,
    dq05Threshold: 0.35
  },

  /** §4.3/§III.3 — hWDL severity banding (Task 54.2). `hwdl` is a [0,1]
   * fraction (preventable expected-score loss), so these bands are the same
   * calibration `CONFIG.severity`'s drop thresholds already encode
   * (goodMaxDrop/inaccuracyMaxDrop/mistakeMaxDrop are 0-100 win% points; /100
   * here), just re-labeled onto §III.3's four-band scale instead of the
   * five-tier move-quality ladder: excellent+good -> minor, inaccuracy ->
   * meaningful, mistake -> major, blunder -> decisive. Reuses
   * `CONFIG.severity`'s own damping thresholds (dampingHighWin/LowWin,
   * deadDrawWinLow/High/CpAbs) for the already-decided-position cap rather
   * than duplicating them. */
  hwdl: {
    minorMaxHwdl: 0.05,
    meaningfulMaxHwdl: 0.1,
    majorMaxHwdl: 0.2
  },

  /** §4.6 — game-clustered beta-binomial failure-rate estimation (Task
   * 55.1). `priorStrength` is the rating-derived Beta prior's pseudo-count
   * of opportunities — weak enough that four or five real games of data
   * dominate it, but present so a code with zero observed opportunities
   * still returns a sane (rating-shaped) estimate instead of `NaN`.
   * `priorMeanSlope` controls how far the prior mean swings away from 0.5
   * per half-width of the code's `ratingPrior` band the student's own
   * rating sits outside it (§0.1: below the band the issue is typically
   * still live; above it, typically resolved). `ciZ` is the normal-
   * approximation z-score for the reported credible interval (1.645 ≈ 90%,
   * chosen over 95% because §4.6 explicitly calls these "practical
   * defaults, not immutable statistical laws" and a narrower band is more
   * useful for focus selection). */
  betaBinomial: {
    priorStrength: 4,
    priorMeanSlope: 0.3,
    priorMeanFloor: 0.05,
    priorMeanCeil: 0.95,
    ciZ: 1.645
  },

  /** §4.2/§II.A — data-quality gate thresholds (Task 55.2). `minRatedGames`
   * is §4.2's own "start with 30 recent rated games" floor (before the
   * spec's own 60-100 expansion, which is the caller's job when a code's
   * opportunities are rare, not this gate's). `dominanceShareThreshold` and
   * `ratingSwingThreshold` have no spec-given number ("unusual session",
   * "rapidly changing") — picked as the least-arbitrary practical defaults
   * available until real data recalibrates them, same as
   * `ratingEstimate.mediumConfidenceMinMoves`'s precedent. DQ-05 reuses
   * `CONFIG.humanReachability.dq05Threshold` rather than duplicating it. */
  dataQualityGates: {
    minRatedGames: 30,
    minOpportunities: 8,
    maxClockMissingRatio: 0.2,
    dominanceShareThreshold: 0.6,
    ratingSwingThreshold: 200
  },

  /** §4.3/§4.6/§III.1/§III.2 — the per-user diagnostic profile (Task 55.3).
   * Confidence thresholds are §4.6's own table read literally ("at least
   * two independent related incidents across more than one game" for
   * Signal; "normally at least four failures from eight opportunities,
   * spread across at least three games and two sessions" for Probable).
   * The scope-tag and session-gap numbers have no spec-given value — least-
   * arbitrary practical defaults, same precedent as `dataQualityGates`. */
  diagnosticProfile: {
    confidenceSignalMinEpisodes: 2,
    confidenceSignalMinGames: 2,
    confidenceProbableMinEpisodes: 4,
    confidenceProbableMinOpportunities: 8,
    confidenceProbableMinGames: 3,
    confidenceProbableMinSessions: 2,
    /** A bucket (opening, session, clock half, ...) needs at least this
     * many opportunities before its rate is trusted enough to tag. */
    scopeMinBucketOpportunities: 3,
    /** A bucket's failure rate must be at least this many times the rest
     * of the sample's rate, *and* clear `scopeMinAbsoluteRateGap`, to be
     * tagged bound to that dimension. */
    scopeRateRatioThreshold: 1.5,
    scopeMinAbsoluteRateGap: 0.15,
    /** Gap between consecutive games' `playedAt` past which a new session
     * is assumed to have started. */
    sessionGapMs: 60 * 60 * 1000,
    /** A same-code opposite-direction rate at or below this counts as an
     * "intact" control skill (§VI requires one in every finding). */
    controlHealthyMaxFailureRate: 0.2,
    /** Beta-prior rating band for a code the catalog somehow doesn't cover
     * — should be unreachable in practice since every `DiagnosisCodeId`
     * comes from the 410-code catalog, but keeps the posterior finite
     * rather than throwing. */
    ratingPriorFallback: [100, 2500] as [number, number]
  },

  /** §IV — 1-2 week focus selection (Task 55.4). `confidenceWeight` reads
   * §4.6's tier straight into the objective's first factor (`insufficient`
   * scores 0 as a belt-and-suspenders alongside the hard confidence
   * filter). `recurrenceSaturation`/`measurementFeasibilitySaturation`
   * reuse `diagnosticProfile.confidenceProbableMinOpportunities`'s own
   * scale (8) rather than inventing a new number — both are "how much
   * evidence is enough to stop caring about more of it," same question
   * §4.6's own Probable threshold already answered. `transferBreadthBoundWeight`
   * and `trainabilityWithoutControlWeight` have no spec-given number —
   * least-arbitrary practical defaults, same precedent as
   * `dataQualityGates`. `improvingPriorityMultiplier` implements §IV's
   * "reduce priority when... already improving" bullet. */
  selectFocus: {
    confidenceWeight: { insufficient: 0, signal: 0.6, probable: 1 },
    recurrenceSaturation: 8,
    transferBreadthBoundWeight: 0.5,
    trainabilityWithoutControlWeight: 0.6,
    measurementFeasibilitySaturation: 8,
    improvingPriorityMultiplier: 0.5
  }
} as const;
