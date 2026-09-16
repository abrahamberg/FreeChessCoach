import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.L "Attacking play". Per the family README: `directions` is always
 * `['O']` (attacking play is the offensive application of pressure),
 * `parentCategory` is always `'piece_activity'`, `detectability` is always
 * `'dialogue'`. `evidenceTrack` follows the ratingPrior-threshold rule; no
 * entry's lower bound reaches 1400, so every entry is `'game_leak'`.
 */
export const AT_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'AT-01',
    family: 'AT',
    label: 'Attack before development',
    diagnosis: 'Starts a king attack with several pieces undeveloped.',
    ratingPrior: [250, 1250],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-02',
    family: 'AT',
    label: 'Wrong-sector attack',
    diagnosis: 'Attacks on a wing despite the center or king placement favoring elsewhere.',
    ratingPrior: [500, 1850],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-03',
    family: 'AT',
    label: 'Insufficient attacking-force count',
    diagnosis: 'Cannot compare attackers, defenders, and reinforcements.',
    ratingPrior: [400, 1500],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-04',
    family: 'AT',
    label: 'Queen-only attack',
    diagnosis: 'Creates queen threats without integrating other pieces.',
    ratingPrior: [250, 1200],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-05',
    family: 'AT',
    label: 'Missing-attacker integration',
    diagnosis: 'Attack stalls because the least active piece is not included.',
    ratingPrior: [600, 2000],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-06',
    family: 'AT',
    label: 'Failure to open attacking lines',
    diagnosis: 'Keeps useful files and diagonals closed.',
    ratingPrior: [500, 1900],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-07',
    family: 'AT',
    label: 'Wrong attacking pawn lever',
    diagnosis: 'Chooses a pawn advance that closes lines or exposes the king.',
    ratingPrior: [700, 2100],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-08',
    family: 'AT',
    label: 'Defensive-piece count omission',
    diagnosis: 'Omits a defender that can participate.',
    ratingPrior: [600, 2000],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-09',
    family: 'AT',
    label: 'King-escape-square omission',
    diagnosis: 'Calculates checks without tracking flight squares.',
    ratingPrior: [500, 1800],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-10',
    family: 'AT',
    label: 'Key-defender identification failure',
    diagnosis: 'Does not identify which defender must be exchanged or deflected.',
    ratingPrior: [750, 2200],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-11',
    family: 'AT',
    label: 'Premature-check habit',
    diagnosis: 'Gives checks that reduce attacking coordination.',
    ratingPrior: [400, 1600],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-12',
    family: 'AT',
    label: 'Forcing versus strengthening failure',
    diagnosis: 'Forces play when a quiet strengthening move is superior.',
    ratingPrior: [950, 2350],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-13',
    family: 'AT',
    label: 'Wishful-sacrifice attack',
    diagnosis: 'Chooses a thematic-looking sacrifice without sufficient proof.',
    ratingPrior: [500, 2000],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-14',
    family: 'AT',
    label: 'Counterplay omission during attack',
    diagnosis: 'Ignores a stronger central or opposite-wing threat.',
    ratingPrior: [700, 2200],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-15',
    family: 'AT',
    label: 'Attack-race tempo miscount',
    diagnosis: 'Misjudges whose threat lands first.',
    ratingPrior: [850, 2300],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-16',
    family: 'AT',
    label: 'Attack-abandonment timing failure',
    diagnosis: 'Continues a dead attack or abandons a viable one too early.',
    ratingPrior: [900, 2350],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-17',
    family: 'AT',
    label: 'Attack-to-endgame transition failure',
    diagnosis: 'Rejects favorable liquidation because the original attack disappears.',
    ratingPrior: [1000, 2450],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-18',
    family: 'AT',
    label: 'Opposite-side castling race failure',
    diagnosis: 'Loses tempi or opens the wrong files in mutual attacks.',
    ratingPrior: [700, 2200],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-19',
    family: 'AT',
    label: 'Same-side pawn-storm self-exposure',
    diagnosis: 'Advances king-cover pawns without sufficient justification.',
    ratingPrior: [500, 1850],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  },
  {
    id: 'AT-20',
    family: 'AT',
    label: 'Central-counterstrike blindness',
    diagnosis: 'Continues wing play while a central break is decisive.',
    ratingPrior: [850, 2300],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'piece_activity'
  }
];
