import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.F "Candidate generation, calculation, and visualization". Per the
 * family README: `directions` default `['N']` except `CA-03` ("Opponent-"
 * prefixed -> `['D']`); `evidenceTrack` uses the ratingPrior>=1400 threshold
 * (`CA-22`, `CA-27`, `CA-28` -> `'curriculum_only_gap'`, rest `'game_leak'`);
 * `detectability` is always `'dialogue'`; `parentCategory` is always
 * `'calculation_error'`.
 */
export const CA_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'CA-01',
    family: 'CA',
    label: 'Single-candidate search',
    diagnosis: 'Normally produces only one serious candidate in critical positions.',
    ratingPrior: [400, 1900],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-02',
    family: 'CA',
    label: 'Unpruned candidate overload',
    diagnosis: 'Considers too many low-value candidates and cannot allocate depth.',
    ratingPrior: [1200, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-03',
    family: 'CA',
    label: 'Opponent-forcing-reply omission',
    diagnosis: 'Omits one or more opponent checks, captures, or direct threats.',
    ratingPrior: [450, 2000],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-04',
    family: 'CA',
    label: 'Quiet-candidate omission',
    diagnosis: 'Search includes forcing moves but excludes improving or restrictive moves.',
    ratingPrior: [900, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-05',
    family: 'CA',
    label: 'Prophylactic-candidate omission',
    diagnosis: 'Does not generate moves whose main purpose is stopping the opponent.',
    ratingPrior: [1000, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-06',
    family: 'CA',
    label: 'Assumed-recapture error',
    diagnosis: 'Assumes the opponent must recapture and ignores alternatives.',
    ratingPrior: [400, 1700],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-07',
    family: 'CA',
    label: 'Natural-reply substitution',
    diagnosis: 'Calculates against a plausible reply instead of the strongest reply.',
    ratingPrior: [700, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-08',
    family: 'CA',
    label: 'Stops after apparent gain',
    diagnosis: 'Ends calculation immediately after winning material or giving check.',
    ratingPrior: [500, 1800],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-09',
    family: 'CA',
    label: 'Failure to reach quiescence',
    diagnosis: 'Evaluates while forcing moves or unresolved captures remain.',
    ratingPrior: [650, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-10',
    family: 'CA',
    label: 'Insufficient calculation depth',
    diagnosis: 'Stops one move before the decisive consequence.',
    ratingPrior: [600, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-11',
    family: 'CA',
    label: 'Insufficient branch width',
    diagnosis: 'Calculates one line deeply but misses a critical alternative.',
    ratingPrior: [850, 2350],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-12',
    family: 'CA',
    label: 'Calculation move-order blindness',
    diagnosis: 'Sees component moves but does not compare their ordering.',
    ratingPrior: [750, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-13',
    family: 'CA',
    label: 'Branch-merging error',
    diagnosis: 'Combines features from different variations.',
    ratingPrior: [900, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-14',
    family: 'CA',
    label: 'Piece-location visualization drift',
    diagnosis: 'Relocates or forgets a piece during calculation.',
    ratingPrior: [600, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-15',
    family: 'CA',
    label: 'Captured-piece reappearance',
    diagnosis: 'Treats a captured piece as if it still exists.',
    ratingPrior: [500, 1800],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-16',
    family: 'CA',
    label: 'Line-state visualization drift',
    diagnosis: 'Forgets a changed file, diagonal, square, or pawn structure.',
    ratingPrior: [700, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-17',
    family: 'CA',
    label: 'Leaf-position material-count failure',
    diagnosis: 'Visualizes the final board but counts its material incorrectly.',
    ratingPrior: [450, 1700],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-18',
    family: 'CA',
    label: 'Leaf-position evaluation failure',
    diagnosis: 'Visualizes the final board but evaluates the wrong factors.',
    ratingPrior: [900, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-19',
    family: 'CA',
    label: 'Candidate-comparison failure',
    diagnosis: 'Calculates lines but does not compare them from one consistent root.',
    ratingPrior: [1000, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-20',
    family: 'CA',
    label: 'Confirmation-biased calculation',
    diagnosis: 'Searches for support for the favored move more deeply than for refutations.',
    ratingPrior: [700, 2400],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-21',
    family: 'CA',
    label: 'Critical-moment recognition failure',
    diagnosis: 'Does not recognize when deeper calculation or extra time is required.',
    ratingPrior: [700, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-22',
    family: 'CA',
    label: 'Selective-depth misallocation',
    diagnosis: 'Overcalculates low-risk branches and undercalculates the critical one.',
    ratingPrior: [1400, 2500],
    directions: ['N'],
    evidenceTrack: 'curriculum_only_gap',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-23',
    family: 'CA',
    label: 'Hidden defensive resource omission',
    diagnosis: 'An otherwise correct attack misses an unexpected defense.',
    ratingPrior: [1100, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-24',
    family: 'CA',
    label: 'Only-move search failure',
    diagnosis: 'Searches for a good move when the position requires the only viable move.',
    ratingPrior: [1000, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-25',
    family: 'CA',
    label: 'Sacrifice-verification failure',
    diagnosis: 'Sacrifices without proving recovery, mate, perpetual, or compensation.',
    ratingPrior: [700, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-26',
    family: 'CA',
    label: 'Tactical-to-positional horizon failure',
    diagnosis: 'Calculates the forcing sequence but not the resulting long-term position.',
    ratingPrior: [1200, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-27',
    family: 'CA',
    label: 'Transposition-recognition failure',
    diagnosis: 'Recalculates equivalent branches or evaluates them inconsistently.',
    ratingPrior: [1400, 2500],
    directions: ['N'],
    evidenceTrack: 'curriculum_only_gap',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-28',
    family: 'CA',
    label: 'Calculation-efficiency deficit',
    diagnosis: 'Reaches correct conclusions only through repetitive, disorganized search.',
    ratingPrior: [1500, 2500],
    directions: ['N'],
    evidenceTrack: 'curriculum_only_gap',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-29',
    family: 'CA',
    label: 'Ghost or illegal move in calculation',
    diagnosis: 'Calculates a move that is illegal or depends on a nonexistent line or piece.',
    ratingPrior: [350, 1600],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'CA-30',
    family: 'CA',
    label: 'Root-position encoding failure',
    diagnosis: 'Begins calculation with an inaccurate model of the current position.',
    ratingPrior: [400, 1800],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  }
];
