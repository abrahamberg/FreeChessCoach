import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.C "Board vision and attack maps". Per the family README: `directions`
 * is `['D']` for BV-01 (own blindness), `['O']` for BV-02 (opponent
 * blindness), `['B']` everywhere else (a board-vision gap impairs both
 * directions). `evidenceTrack` is `'game_leak'` throughout (no entry's
 * ratingPrior lower bound reaches the 1400 curriculum-only threshold).
 * `detectability` is `'dialogue'`; `parentCategory` is always
 * `'hanging_piece'` (the closest existing bucket to board-vision failures).
 */
export const BV_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'BV-01',
    family: 'BV',
    label: 'Own hanging-piece blindness',
    diagnosis: 'Repeatedly leaves a piece freely capturable and misses its status in static tests.',
    ratingPrior: [250, 1000],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-02',
    family: 'BV',
    label: 'Opponent hanging-piece blindness',
    diagnosis: 'Fails to take free enemy pieces despite adequate time and no complication.',
    ratingPrior: [250, 1050],
    directions: ['O'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-03',
    family: 'BV',
    label: 'Undefended versus underdefended confusion',
    diagnosis: 'Cannot distinguish zero defenders from too few defenders.',
    ratingPrior: [400, 1200],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-04',
    family: 'BV',
    label: 'Attacker–defender counting failure',
    diagnosis: 'Counts exchanges on one square incorrectly before deeper calculation.',
    ratingPrior: [400, 1350],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-05',
    family: 'BV',
    label: 'Pawn attack-map blindness',
    diagnosis: 'Misses pawn-controlled squares or reverses pawn attack direction.',
    ratingPrior: [200, 900],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-06',
    family: 'BV',
    label: 'Knight attack-map blindness',
    diagnosis: 'Cannot map current or one-move-future knight attacks.',
    ratingPrior: [250, 1050],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-07',
    family: 'BV',
    label: 'Long-diagonal blindness',
    diagnosis: 'Misses bishop or queen influence across a long diagonal.',
    ratingPrior: [300, 1400],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-08',
    family: 'BV',
    label: 'Rank/file ray blindness',
    diagnosis: 'Misses rook or queen attacks across a rank or file.',
    ratingPrior: [300, 1350],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-09',
    family: 'BV',
    label: 'King-capture safety blindness',
    diagnosis: 'Believes the king can safely capture a defended unit.',
    ratingPrior: [200, 850],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-10',
    family: 'BV',
    label: 'Last-move board-update failure',
    diagnosis: 'Fails to update attacks and defenses after the opponent moves.',
    ratingPrior: [300, 1300],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-11',
    family: 'BV',
    label: 'Last-move purpose blindness',
    diagnosis: 'Sees the move but not its threat, line, defender, break, or structural purpose.',
    ratingPrior: [500, 1800],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-12',
    family: 'BV',
    label: 'Removed-blocker blindness',
    diagnosis: 'Misses a newly opened line after a move or capture.',
    ratingPrior: [400, 1700],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-13',
    family: 'BV',
    label: 'New-blocker blindness',
    diagnosis: 'Calculates through a line that has become blocked.',
    ratingPrior: [500, 1750],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-14',
    family: 'BV',
    label: 'Vacated-square blindness',
    diagnosis: 'Notices the destination but not the abandoned square or line.',
    ratingPrior: [550, 1850],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-15',
    family: 'BV',
    label: 'Destination-square safety blindness',
    diagnosis: 'Does not verify whether the moved piece is safe on arrival.',
    ratingPrior: [200, 1150],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-16',
    family: 'BV',
    label: 'Self-exposure blindness',
    diagnosis: 'A move exposes the king, queen, or another unit along an overlooked line.',
    ratingPrior: [350, 1550],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-17',
    family: 'BV',
    label: 'Backward/retreating-move blindness',
    diagnosis: 'Search disproportionately excludes retreats and backward attacks.',
    ratingPrior: [650, 2050],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-18',
    family: 'BV',
    label: 'Edge/corner geometry blind spot',
    diagnosis: 'Accuracy drops for pieces or targets near board edges and corners.',
    ratingPrior: [300, 1500],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-19',
    family: 'BV',
    label: 'Multi-attack tracking overload',
    diagnosis: 'Attack-map accuracy collapses when several units are simultaneously attacked.',
    ratingPrior: [600, 2200],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-20',
    family: 'BV',
    label: 'Cross-board attention split',
    diagnosis: 'Action on one wing causes repeated misses on the other.',
    ratingPrior: [800, 2300],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-21',
    family: 'BV',
    label: 'Check-status awareness failure',
    diagnosis: 'Does not reliably register that a king is currently in check.',
    ratingPrior: [100, 650],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  },
  {
    id: 'BV-22',
    family: 'BV',
    label: 'Loose-piece inventory failure',
    diagnosis: 'Cannot consistently identify all undefended or tactically loose pieces.',
    ratingPrior: [300, 1450],
    directions: ['B'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'hanging_piece'
  }
];
