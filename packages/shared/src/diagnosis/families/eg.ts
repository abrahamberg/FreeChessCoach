import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.O "Endgame glossary" — four subtables (elementary/pawn, rook,
 * minor-piece, queen/mixed) merged into one family; id numbering isn't
 * sequential (EG-53/EG-54 are appended to the elementary subtable). These
 * subtables have no separate longer diagnosis sentence, so `diagnosis`
 * repeats the "Atomic diagnosis" column text verbatim, same as `label`.
 * Per the family README: `directions` default `['N']` (no label here
 * starts with 'Own-'/'Opponent-'), `detectability` is always `'dialogue'`,
 * `parentCategory` is always `'endgame_technique'`, and `evidenceTrack` is
 * `'curriculum_only_gap'` when `ratingPrior[0] >= 1400` (rare, high-rating
 * technique) else `'game_leak'`.
 */
export const EG_CODES: readonly DiagnosisCodeEntry[] = [
  // Elementary and pawn endings
  {
    id: 'EG-01',
    family: 'EG',
    label: 'King-and-queen mate technique',
    diagnosis: 'King-and-queen mate technique',
    ratingPrior: [100, 600],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-02',
    family: 'EG',
    label: 'King-and-rook mate technique',
    diagnosis: 'King-and-rook mate technique',
    ratingPrior: [200, 800],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-03',
    family: 'EG',
    label: 'Two-bishop mate knowledge',
    diagnosis: 'Two-bishop mate knowledge',
    ratingPrior: [950, 1900],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-04',
    family: 'EG',
    label: 'Bishop-and-knight mate knowledge',
    diagnosis: 'Bishop-and-knight mate knowledge',
    ratingPrior: [1400, 2500],
    directions: ['N'],
    evidenceTrack: 'curriculum_only_gap',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-05',
    family: 'EG',
    label: 'Insufficient-material recognition',
    diagnosis: 'Insufficient-material recognition',
    ratingPrior: [100, 650],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-06',
    family: 'EG',
    label: 'Endgame king-activation failure',
    diagnosis: 'Endgame king-activation failure',
    ratingPrior: [300, 1200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-07',
    family: 'EG',
    label: 'Rule-of-the-square knowledge',
    diagnosis: 'Rule-of-the-square knowledge',
    ratingPrior: [350, 1000],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-08',
    family: 'EG',
    label: 'Basic pawn-race calculation',
    diagnosis: 'Basic pawn-race calculation',
    ratingPrior: [400, 1300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-09',
    family: 'EG',
    label: 'Direct-opposition knowledge',
    diagnosis: 'Direct-opposition knowledge',
    ratingPrior: [400, 1100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-10',
    family: 'EG',
    label: 'Distant/diagonal opposition',
    diagnosis: 'Distant/diagonal opposition',
    ratingPrior: [700, 1650],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-11',
    family: 'EG',
    label: 'Key-square knowledge',
    diagnosis: 'Key-square knowledge',
    ratingPrior: [450, 1250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-12',
    family: 'EG',
    label: 'Rook-pawn exception knowledge',
    diagnosis: 'Rook-pawn exception knowledge',
    ratingPrior: [500, 1400],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-13',
    family: 'EG',
    label: 'Shouldering technique',
    diagnosis: 'Shouldering technique',
    ratingPrior: [700, 1750],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-14',
    family: 'EG',
    label: 'Triangulation knowledge',
    diagnosis: 'Triangulation knowledge',
    ratingPrior: [750, 1800],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-15',
    family: 'EG',
    label: 'Reserve-tempo knowledge',
    diagnosis: 'Reserve-tempo knowledge',
    ratingPrior: [750, 1850],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-16',
    family: 'EG',
    label: 'Zugzwang recognition',
    diagnosis: 'Zugzwang recognition',
    ratingPrior: [650, 1900],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-17',
    family: 'EG',
    label: 'Pawn-breakthrough recognition',
    diagnosis: 'Pawn-breakthrough recognition',
    ratingPrior: [600, 1700],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-18',
    family: 'EG',
    label: 'Corresponding-squares knowledge',
    diagnosis: 'Corresponding-squares knowledge',
    ratingPrior: [1450, 2500],
    directions: ['N'],
    evidenceTrack: 'curriculum_only_gap',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-19',
    family: 'EG',
    label: 'Wrong-bishop rook-pawn knowledge',
    diagnosis: 'Wrong-bishop rook-pawn knowledge',
    ratingPrior: [550, 1500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-20',
    family: 'EG',
    label: 'Outside-passed-pawn technique',
    diagnosis: 'Outside-passed-pawn technique',
    ratingPrior: [650, 1850],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-21',
    family: 'EG',
    label: 'Connected-passer calculation',
    diagnosis: 'Connected-passer calculation',
    ratingPrior: [600, 1900],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-53',
    family: 'EG',
    label: 'Ladder-mate technique',
    diagnosis: 'Ladder-mate technique',
    ratingPrior: [100, 500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-54',
    family: 'EG',
    label: 'Stalemate-avoidance knowledge',
    diagnosis: 'Stalemate-avoidance knowledge',
    ratingPrior: [150, 900],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  // Rook endings
  {
    id: 'EG-22',
    family: 'EG',
    label: 'Rook behind the passed pawn',
    diagnosis: 'Rook behind the passed pawn',
    ratingPrior: [650, 1750],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-23',
    family: 'EG',
    label: 'Active-rook priority',
    diagnosis: 'Active-rook priority',
    ratingPrior: [700, 1950],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-24',
    family: 'EG',
    label: 'King-cutoff technique',
    diagnosis: 'King-cutoff technique',
    ratingPrior: [800, 2050],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-25',
    family: 'EG',
    label: 'Checking-distance knowledge',
    diagnosis: 'Checking-distance knowledge',
    ratingPrior: [950, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-26',
    family: 'EG',
    label: 'Side-checking technique',
    diagnosis: 'Side-checking technique',
    ratingPrior: [1050, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-27',
    family: 'EG',
    label: 'Lucena-position knowledge',
    diagnosis: 'Lucena-position knowledge',
    ratingPrior: [900, 2050],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-28',
    family: 'EG',
    label: 'Philidor-position knowledge',
    diagnosis: 'Philidor-position knowledge',
    ratingPrior: [850, 2000],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-29',
    family: 'EG',
    label: 'Short-side defense',
    diagnosis: 'Short-side defense',
    ratingPrior: [1150, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-30',
    family: 'EG',
    label: 'Vancura-position knowledge',
    diagnosis: 'Vancura-position knowledge',
    ratingPrior: [1650, 2500],
    directions: ['N'],
    evidenceTrack: 'curriculum_only_gap',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-31',
    family: 'EG',
    label: 'Frontal-defense knowledge',
    diagnosis: 'Frontal-defense knowledge',
    ratingPrior: [1100, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-32',
    family: 'EG',
    label: 'Rook-ending king-shelter failure',
    diagnosis: 'Rook-ending king-shelter failure',
    ratingPrior: [900, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-33',
    family: 'EG',
    label: 'Four-versus-three same-wing technique',
    diagnosis: 'Four-versus-three same-wing technique',
    ratingPrior: [1450, 2500],
    directions: ['N'],
    evidenceTrack: 'curriculum_only_gap',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-34',
    family: 'EG',
    label: 'Extra-outside-pawn rook ending',
    diagnosis: 'Extra-outside-pawn rook ending',
    ratingPrior: [1250, 2450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-35',
    family: 'EG',
    label: 'Rook-trade judgment failure',
    diagnosis: 'Rook-trade judgment failure',
    ratingPrior: [850, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  // Minor-piece endings
  {
    id: 'EG-36',
    family: 'EG',
    label: 'Opposite-colored-bishop technique',
    diagnosis: 'Opposite-colored-bishop technique',
    ratingPrior: [750, 2000],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-37',
    family: 'EG',
    label: 'Same-colored-bishop technique',
    diagnosis: 'Same-colored-bishop technique',
    ratingPrior: [850, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-38',
    family: 'EG',
    label: 'Bishop-versus-knight ending judgment',
    diagnosis: 'Bishop-versus-knight ending judgment',
    ratingPrior: [850, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-39',
    family: 'EG',
    label: 'Knight-blockade technique',
    diagnosis: 'Knight-blockade technique',
    ratingPrior: [750, 2050],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-40',
    family: 'EG',
    label: 'Knight-versus-rook-pawn knowledge',
    diagnosis: 'Knight-versus-rook-pawn knowledge',
    ratingPrior: [850, 2150],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-41',
    family: 'EG',
    label: 'Bishop-on-both-wings technique',
    diagnosis: 'Bishop-on-both-wings technique',
    ratingPrior: [950, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-42',
    family: 'EG',
    label: 'Good-knight-versus-bad-bishop technique',
    diagnosis: 'Good-knight-versus-bad-bishop technique',
    ratingPrior: [1050, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  // Queen and mixed endings
  {
    id: 'EG-43',
    family: 'EG',
    label: 'Queen-ending perpetual geometry',
    diagnosis: 'Queen-ending perpetual geometry',
    ratingPrior: [950, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-44',
    family: 'EG',
    label: 'Queen-ending king-safety judgment',
    diagnosis: 'Queen-ending king-safety judgment',
    ratingPrior: [1050, 2450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-45',
    family: 'EG',
    label: 'Queen-trade transition judgment',
    diagnosis: 'Queen-trade transition judgment',
    ratingPrior: [850, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-46',
    family: 'EG',
    label: 'Queen-versus-advanced-pawn technique',
    diagnosis: 'Queen-versus-advanced-pawn technique',
    ratingPrior: [950, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-47',
    family: 'EG',
    label: 'Exchange-ending technique',
    diagnosis: 'Exchange-ending technique',
    ratingPrior: [950, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-48',
    family: 'EG',
    label: 'Rook-versus-minor-piece technique',
    diagnosis: 'Rook-versus-minor-piece technique',
    ratingPrior: [1150, 2400],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-49',
    family: 'EG',
    label: 'Queen-versus-rook technique',
    diagnosis: 'Queen-versus-rook technique',
    ratingPrior: [1500, 2500],
    directions: ['N'],
    evidenceTrack: 'curriculum_only_gap',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-50',
    family: 'EG',
    label: 'Endgame-fortress recognition',
    diagnosis: 'Endgame-fortress recognition',
    ratingPrior: [1350, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-51',
    family: 'EG',
    label: 'Fifty-move/tablebase-boundary awareness',
    diagnosis: 'Fifty-move/tablebase-boundary awareness',
    ratingPrior: [1800, 2500],
    directions: ['N'],
    evidenceTrack: 'curriculum_only_gap',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  },
  {
    id: 'EG-52',
    family: 'EG',
    label: 'Endgame-entry decision failure',
    diagnosis: 'Endgame-entry decision failure',
    ratingPrior: [850, 2450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'endgame_technique'
  }
];
