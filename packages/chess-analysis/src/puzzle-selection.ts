import type { DiagnosisCodeId } from '@freechesscoach/shared';

/** One row of the puzzle index apps/api/scripts/build-puzzle-index.mjs
 * builds from Lichess's open puzzle database — see that script and
 * apps/api/data/README.md for provenance. `moves` is UCI, first entry the
 * opponent's setup move (Lichess's own convention — see
 * `../data/README.md`'s puzzle-fixture section). */
export interface PuzzleRecord {
  puzzleId: string;
  fen: string;
  moves: readonly string[];
  rating: number;
  themes: readonly string[];
}

/**
 * Diagnosis code -> Lichess puzzle themes that exercise it, best match
 * first. Two different confidence levels live in here, and callers that
 * care about the difference should check `TA_CODES_WITH_VALIDATED_THEMES`:
 *
 * - The `TA-*` entries are the same theme correspondence
 *   `motif-to-code.ts`'s `DIRECT_CODE_BY_MOTIF`/`FORK_CODE_BY_PIECE`/
 *   `PIN_CODE_BY_KIND` already use to go the other direction (a detected
 *   motif -> our code), and `tactic-detectors/lichess-puzzle-validation.
 *   test.ts` measures how often `classifyTacticMotif` actually agrees with
 *   each of these Lichess tags. `TA-01` omits `mateIn2`/`mateIn3`/etc:
 *   those still resolve to `classifyTacticMotif` returning `'checkmate'`
 *   same as `mateIn1` (`isCheckmate` is checked directly, not motif-typed),
 *   they're just longer combinations, useful for a harder puzzle.
 * - The `MS-*` (and `BV-*`) entries are a hand-picked, *unvalidated*
 *   heuristic: no Lichess theme means "opponent-check scan omission", so
 *   these are proxies chosen by what the theme's puzzles actually demand
 *   of the solver (e.g. MS-01 trains scanning for opponent checks before
 *   moving, so puzzles whose point IS an unscanned check — exposedKing,
 *   discoveredCheck, doubleCheck). Treat these as a reasonable starting
 *   point to refine by feel, not as ground truth the way the TA-* list is.
 */
export const DIAGNOSIS_CODE_PUZZLE_THEMES: Partial<Record<DiagnosisCodeId, readonly string[]>> = {
  // TA-* — validated against real Lichess theme tags (see file doc comment).
  'TA-01': ['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5'],
  'TA-04': ['backRankMate'],
  'TA-07': ['fork'],
  'TA-08': ['fork'],
  'TA-09': ['fork'],
  'TA-10': ['fork'],
  'TA-11': ['pin'],
  'TA-12': ['pin'],
  'TA-14': ['skewer'],
  'TA-16': ['discoveredAttack'],
  'TA-17': ['doubleCheck'],
  'TA-18': ['capturingDefender', 'deflection'],
  'TA-26': ['trappedPiece'],
  'TA-43': ['hangingPiece'],

  // MS-* "one-ply move-safety process" (CCT scan) codes — unvalidated heuristic.
  'MS-01': ['exposedKing', 'discoveredCheck', 'doubleCheck'], // opponent-check scan omission
  'MS-02': ['hangingPiece', 'capturingDefender'], // opponent-capture scan omission
  'MS-03': ['mateIn1', 'mateIn2', 'promotion', 'trappedPiece'], // opponent-direct-threat omission
  'MS-04': ['discoveredCheck', 'doubleCheck', 'attraction'], // own-check generation omission
  'MS-05': ['hangingPiece', 'fork'], // own-capture generation omission
  'MS-06': ['quietMove', 'defensiveMove', 'zugzwang'], // own-direct-threat generation omission
  'MS-07': ['intermezzo'], // automatic-recapture reflex (i.e. missing a zwischenzug)
  'MS-08': ['hangingPiece'], // final destination-safety omission

  // BV-* board-vision codes — unvalidated heuristic.
  'BV-01': ['hangingPiece'], // own hanging-piece blindness
  'BV-02': ['hangingPiece'] // opponent hanging-piece blindness
};

/** The subset of `DIAGNOSIS_CODE_PUZZLE_THEMES` keys whose theme mapping is
 * measured (not just guessed) — currently every `TA-*` entry. */
export const TA_CODES_WITH_VALIDATED_THEMES: ReadonlySet<DiagnosisCodeId> = new Set(
  Object.keys(DIAGNOSIS_CODE_PUZZLE_THEMES).filter((code) => code.startsWith('TA-'))
);

export interface SelectPuzzlesOptions {
  code: DiagnosisCodeId;
  /** Student's current rating — puzzles are chosen closest to this first. */
  rating: number;
  /** How far from `rating` a puzzle may be before widening; widens by this
   * amount (doubling each retry) until `count` puzzles are found or the
   * whole pool has been considered. Default 150. */
  ratingWindow?: number;
  /** Cap on solving length (number of solver plies, i.e. excluding the
   * puzzle's opponent setup move) — lower for a "one clean decision"
   * drill, higher to also train calculating a few steps ahead. Omit for
   * no cap. */
  maxSolverPlies?: number;
  count: number;
}

function solverPlyCount(moves: readonly string[]): number {
  return Math.floor(moves.length / 2);
}

/**
 * Picks up to `count` puzzles from `pool` that train `options.code`,
 * closest to the student's rating first. Pure and pool-agnostic — the
 * caller supplies whatever puzzle index it has loaded (see
 * `apps/api/scripts/build-puzzle-index.mjs`).
 */
export function selectPuzzles(pool: readonly PuzzleRecord[], options: SelectPuzzlesOptions): PuzzleRecord[] {
  const themes = DIAGNOSIS_CODE_PUZZLE_THEMES[options.code];
  if (!themes || themes.length === 0) return [];

  const themeSet = new Set(themes);
  const candidates = pool
    .filter((puzzle) => puzzle.themes.some((theme) => themeSet.has(theme)))
    .filter((puzzle) => options.maxSolverPlies === undefined || solverPlyCount(puzzle.moves) <= options.maxSolverPlies);
  if (candidates.length === 0) return [];

  const baseWindow = options.ratingWindow ?? 150;
  let window = baseWindow;
  let inWindow: PuzzleRecord[] = [];
  // Widen the rating window until enough candidates are in range, capping
  // at the full candidate rating spread so this always terminates.
  const maxWindow = Math.max(...candidates.map((p) => Math.abs(p.rating - options.rating)), baseWindow);
  while (inWindow.length < options.count && window <= maxWindow) {
    inWindow = candidates.filter((puzzle) => Math.abs(puzzle.rating - options.rating) <= window);
    window *= 2;
  }
  if (inWindow.length < options.count) inWindow = candidates;

  return [...inWindow]
    .sort((a, b) => Math.abs(a.rating - options.rating) - Math.abs(b.rating - options.rating))
    .slice(0, options.count);
}
