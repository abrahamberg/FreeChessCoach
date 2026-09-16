import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.H "Opening diagnostics". Per the family README: `directions` default
 * `['N']` (no label here starts with 'Own-'/'Opponent-'), `parentCategory`
 * is always `'opening_knowledge'`, `detectability` is always `'dialogue'`,
 * `evidenceTrack` follows the ratingPrior-threshold rule (only OP-21's
 * 1750 lower bound crosses 1400, so it alone is `'curriculum_only_gap'`).
 */
export const OP_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'OP-01',
    family: 'OP',
    label: 'Early central-control neglect',
    diagnosis: 'Repeated early moves concede the center without concrete justification.',
    ratingPrior: [200, 800],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-02',
    family: 'OP',
    label: 'Minor-piece development delay',
    diagnosis: 'Unnecessary moves leave the student behind in development.',
    ratingPrior: [200, 900],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-03',
    family: 'OP',
    label: 'Repeated-piece development loss',
    diagnosis: 'One piece moves repeatedly while others remain undeveloped.',
    ratingPrior: [250, 950],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-04',
    family: 'OP',
    label: 'Premature queen activity',
    diagnosis: 'Early queen moves invite tempos or replace necessary development.',
    ratingPrior: [200, 1000],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-05',
    family: 'OP',
    label: 'Castling/king-safety timing failure',
    diagnosis: 'Leaves the king exposed or castles automatically into danger.',
    ratingPrior: [300, 1250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-06',
    family: 'OP',
    label: 'Premature flank-pawn movement',
    diagnosis: 'Nonessential flank moves create weaknesses or delay development.',
    ratingPrior: [250, 1100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-07',
    family: 'OP',
    label: 'Opening move-safety failure',
    diagnosis: 'Opening losses come from immediate hangs or one-ply tactics, not theory.',
    ratingPrior: [200, 1250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-08',
    family: 'OP',
    label: 'Opening material-greed failure',
    diagnosis: 'Takes or keeps material despite visible development or king-safety costs.',
    ratingPrior: [400, 1500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-09',
    family: 'OP',
    label: 'Core-line recall gap',
    diagnosis: 'A previously studied branch cannot be retrieved. Exact branch required.',
    ratingPrior: [700, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-10',
    family: 'OP',
    label: 'Rote sequence without causal understanding',
    diagnosis: 'Remembers moves but cannot explain threats, breaks, or placements.',
    ratingPrior: [600, 1900],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-11',
    family: 'OP',
    label: 'Early-deviation adaptation failure',
    diagnosis: "Continues memorized moves after the opponent's deviation changes the position.",
    ratingPrior: [700, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-12',
    family: 'OP',
    label: 'Opening-transposition recognition failure',
    diagnosis: 'Knows both positions but does not recognize the move-order transposition.',
    ratingPrior: [950, 2450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-13',
    family: 'OP',
    label: 'Repertoire-adherence failure',
    diagnosis: 'Repeatedly abandons the agreed repertoire without a conscious reason.',
    ratingPrior: [600, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-14',
    family: 'OP',
    label: 'Recurring branch-specific leak',
    diagnosis: 'Same branch produces the same move, misconception, or process failure.',
    ratingPrior: [700, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-15',
    family: 'OP',
    label: 'Opening clock-allocation failure',
    diagnosis: 'Known positions consume excessive time or unfamiliar ones are rushed.',
    ratingPrior: [500, 2350],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-16',
    family: 'OP',
    label: 'Gambit-handling failure',
    diagnosis: 'Exact subtype required: acceptance, return, development, or decline.',
    ratingPrior: [400, 1900],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-17',
    family: 'OP',
    label: 'Failure to punish an opening error independently',
    diagnosis: 'Continues repertoire mechanically after an inferior opponent move.',
    ratingPrior: [600, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-18',
    family: 'OP',
    label: 'Opening-to-middlegame discontinuity',
    diagnosis: 'Book moves are adequate, but the first independent plan is incoherent.',
    ratingPrior: [750, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-19',
    family: 'OP',
    label: 'Model-position knowledge gap',
    diagnosis: 'Lacks standard placements, exchanges, pawn breaks, or endgames.',
    ratingPrior: [850, 2450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-20',
    family: 'OP',
    label: 'Novel-position candidate failure',
    diagnosis: 'Candidate quality falls disproportionately outside preparation.',
    ratingPrior: [1150, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  },
  {
    id: 'OP-21',
    family: 'OP',
    label: 'Advanced opening move-order imprecision',
    diagnosis: 'Permits a precise resource through inaccurate move order.',
    ratingPrior: [1750, 2500],
    directions: ['N'],
    evidenceTrack: 'curriculum_only_gap',
    detectability: 'dialogue',
    parentCategory: 'opening_knowledge'
  }
];
