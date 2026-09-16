import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.Q "Learning and training-process diagnostics". Per the family README:
 * `evidenceTrack` is always `'process_finding'`, `parentCategory` is always
 * `'no_plan'`, `detectability` is always `'dialogue'`. `directions` default
 * `['N']` except `LR-03`/`LR-04`, manually overridden to `['B']` — both
 * describe an offense/defense *imbalance* itself, not a single direction.
 */
export const LR_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'LR-01',
    family: 'LR',
    label: 'Puzzle-cue dependence',
    diagnosis: 'Solves when told a tactic exists but fails uncued mixed positions.',
    ratingPrior: [300, 2200],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-02',
    family: 'LR',
    label: 'Puzzle-guessing habit',
    diagnosis: 'High speed accompanies weak justification and defensive calculation.',
    ratingPrior: [300, 1800],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-03',
    family: 'LR',
    label: 'Offensive-tactics-only imbalance',
    diagnosis: 'Finds own combinations but misses opponent tactics.',
    ratingPrior: [350, 2200],
    directions: ['B'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-04',
    family: 'LR',
    label: 'Defensive-tactics training gap',
    diagnosis: 'Missed resources disproportionately involve defense, perpetuals, or only moves.',
    ratingPrior: [450, 2350],
    directions: ['B'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-05',
    family: 'LR',
    label: 'Engine-first review dependence',
    diagnosis: 'Cannot reconstruct thoughts because engine analysis came first.',
    ratingPrior: [500, 2500],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-06',
    family: 'LR',
    label: 'Error-attribution failure',
    diagnosis: 'Labels every loss "tactics" or "opening" without a mechanism.',
    ratingPrior: [400, 2500],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-07',
    family: 'LR',
    label: 'Passive opening-memory practice',
    diagnosis: 'Recognizes moves when shown but cannot retrieve them from positions.',
    ratingPrior: [500, 2400],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-08',
    family: 'LR',
    label: 'Repertoire overbreadth',
    diagnosis: 'Similar positions receive too few repetitions for stable learning.',
    ratingPrior: [600, 2400],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-09',
    family: 'LR',
    label: 'Training-to-game mismatch',
    diagnosis: 'Training topics do not match the highest-impact game failures.',
    ratingPrior: [400, 2500],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-10',
    family: 'LR',
    label: 'Missing spaced retrieval',
    diagnosis: 'Previously learned material decays because it is not retested.',
    ratingPrior: [400, 2400],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-11',
    family: 'LR',
    label: 'Drill-to-game transfer failure',
    diagnosis: 'Probe performance improves while game failure rate does not.',
    ratingPrior: [400, 2400],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-12',
    family: 'LR',
    label: 'Thinking-process nonadherence',
    diagnosis: 'Can state the process but does not use it in games.',
    ratingPrior: [400, 2500],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-13',
    family: 'LR',
    label: 'Excessive consecutive-game volume',
    diagnosis: 'Later-session decline continues while rated play continues.',
    ratingPrior: [200, 2400],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-14',
    family: 'LR',
    label: 'Inappropriate time-control dependence',
    diagnosis: 'Chosen control prevents practice of the diagnosed thinking skill.',
    ratingPrior: [200, 2300],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-15',
    family: 'LR',
    label: 'Training-difficulty mismatch',
    diagnosis: 'Exercises are automatic or too difficult to generate useful learning.',
    ratingPrior: [200, 2500],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-16',
    family: 'LR',
    label: 'Outcome-biased review',
    diagnosis: 'Wins are barely reviewed while losses receive all attention.',
    ratingPrior: [400, 2500],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-17',
    family: 'LR',
    label: 'Premature focus switching',
    diagnosis: 'Changes topic before transfer and retention are measured.',
    ratingPrior: [400, 2400],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'LR-18',
    family: 'LR',
    label: 'Persistent nonresponse',
    diagnosis: 'Adherent work produces no probe or game improvement, suggesting a wrong or upstream diagnosis.',
    ratingPrior: [200, 2500],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  }
];
