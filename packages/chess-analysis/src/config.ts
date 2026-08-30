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
  }
} as const;
