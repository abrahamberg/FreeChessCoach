import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.D "One-ply move-safety process". Per the family README: `evidenceTrack`
 * follows the ratingPrior-threshold rule (none of these cross 1400, so all
 * `'game_leak'`), `parentCategory` is always `'calculation_error'`.
 * `directions` follows the general own/opponent prefix rule: MS-01..03
 * ("Opponent-...") -> `['D']`, MS-04..06 ("Own-...") -> `['O']`, the rest ->
 * `['N']`. `detectability` was originally `'dialogue'` throughout; Task 53.3
 * flips MS-01..08 and MS-14 to `'detector'` as `diagnostics/detectors/`
 * gains a file for each — MS-09..13 (fixation, priority, ordering, reset,
 * candidate-delta process habits) stay `'dialogue'`, no detector for them
 * in this plan.
 */
export const MS_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'MS-01',
    family: 'MS',
    label: 'Opponent-check scan omission',
    diagnosis: "Fails to list the opponent's legal checks before moving.",
    ratingPrior: [250, 1000],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'detector',
    parentCategory: 'calculation_error'
  },
  {
    id: 'MS-02',
    family: 'MS',
    label: 'Opponent-capture scan omission',
    diagnosis: 'Omits immediate profitable captures.',
    ratingPrior: [250, 1100],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'detector',
    parentCategory: 'calculation_error'
  },
  {
    id: 'MS-03',
    family: 'MS',
    label: 'Opponent-direct-threat omission',
    diagnosis: 'Misses mate, promotion, trapping, or another direct one-move threat.',
    ratingPrior: [350, 1350],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'detector',
    parentCategory: 'calculation_error'
  },
  {
    id: 'MS-04',
    family: 'MS',
    label: 'Own-check generation omission',
    diagnosis: 'Misses useful checks visible without deep calculation.',
    ratingPrior: [250, 1050],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'detector',
    parentCategory: 'calculation_error'
  },
  {
    id: 'MS-05',
    family: 'MS',
    label: 'Own-capture generation omission',
    diagnosis: 'Misses immediately profitable captures.',
    ratingPrior: [250, 1050],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'detector',
    parentCategory: 'calculation_error'
  },
  {
    id: 'MS-06',
    family: 'MS',
    label: 'Own-direct-threat generation omission',
    diagnosis: 'Considers checks and captures but not forcing threats.',
    ratingPrior: [400, 1450],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'detector',
    parentCategory: 'calculation_error'
  },
  {
    id: 'MS-07',
    family: 'MS',
    label: 'Automatic-recapture reflex',
    diagnosis: 'Recaptures without checking intermediate or stronger moves.',
    ratingPrior: [300, 1450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'detector',
    parentCategory: 'calculation_error'
  },
  {
    id: 'MS-08',
    family: 'MS',
    label: 'Final destination-safety omission',
    diagnosis: 'Does not complete a final one-ply verification of the chosen move.',
    ratingPrior: [250, 1400],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'detector',
    parentCategory: 'calculation_error'
  },
  {
    id: 'MS-09',
    family: 'MS',
    label: 'First-attractive-move fixation',
    diagnosis: 'Stops searching after finding one plausible move.',
    ratingPrior: [350, 1700],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'MS-10',
    family: 'MS',
    label: 'Threat-priority failure',
    diagnosis: 'Sees several threats but responds to the wrong one.',
    ratingPrior: [500, 1850],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'MS-11',
    family: 'MS',
    label: 'Forcing-move ordering failure',
    diagnosis: 'Finds forcing moves but examines them in an ineffective order.',
    ratingPrior: [600, 2000],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'MS-12',
    family: 'MS',
    label: 'Board-reset process omission',
    diagnosis: 'Can identify changes when prompted but does not habitually reset after each move.',
    ratingPrior: [350, 1700],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'MS-13',
    family: 'MS',
    label: 'Candidate-delta scan omission',
    diagnosis: 'Does not inspect what the candidate opens, closes, vacates, attacks, or abandons.',
    ratingPrior: [350, 1800],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'MS-14',
    family: 'MS',
    label: 'Loose-piece scan omission',
    diagnosis: 'Does not check the status of loose pieces before committing to a move.',
    ratingPrior: [350, 1600],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'detector',
    parentCategory: 'calculation_error'
  }
];
