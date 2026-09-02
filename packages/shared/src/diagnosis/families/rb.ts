import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.B "Rules and piece geometry". Per the family README: `directions`
 * default `['N']` (no label here starts with 'Own-'/'Opponent-'),
 * `evidenceTrack` is always `'knowledge_inventory'`, `detectability` is
 * always `'probe'` (§DQ-17), `parentCategory` is always `'calculation_error'`.
 */
export const RB_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'RB-00',
    family: 'RB',
    label: 'Game-objective knowledge',
    diagnosis: 'Does not understand check, checkmate, or the objective of the game.',
    ratingPrior: [100, 250],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  },
  {
    id: 'RB-01',
    family: 'RB',
    label: 'Pawn movement versus capture',
    diagnosis: 'Confuses forward movement, diagonal capture, or direction.',
    ratingPrior: [100, 250],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  },
  {
    id: 'RB-02',
    family: 'RB',
    label: 'Knight-movement knowledge',
    diagnosis: 'Cannot consistently identify legal knight destinations.',
    ratingPrior: [100, 300],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  },
  {
    id: 'RB-03',
    family: 'RB',
    label: 'Sliding-piece ray knowledge',
    diagnosis: 'Misunderstands bishop, rook, or queen movement through blockers.',
    ratingPrior: [100, 350],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  },
  {
    id: 'RB-04',
    family: 'RB',
    label: 'King movement and adjacency',
    diagnosis: 'Allows adjacent kings or entry into an attacked square.',
    ratingPrior: [100, 300],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  },
  {
    id: 'RB-05',
    family: 'RB',
    label: 'Check-evasion knowledge',
    diagnosis: 'Cannot distinguish capture, block, or king-move responses to check.',
    ratingPrior: [100, 400],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  },
  {
    id: 'RB-06',
    family: 'RB',
    label: 'Castling-rule knowledge',
    diagnosis: 'Misunderstands moved-piece restrictions, occupied squares, or attacked transit squares.',
    ratingPrior: [100, 500],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  },
  {
    id: 'RB-07',
    family: 'RB',
    label: 'En-passant knowledge',
    diagnosis: 'Does not know when en passant is legal or how it changes lines.',
    ratingPrior: [100, 700],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  },
  {
    id: 'RB-08',
    family: 'RB',
    label: 'Promotion-choice knowledge',
    diagnosis: 'Misses promotion or assumes promotion must be to a queen.',
    ratingPrior: [100, 550],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  },
  {
    id: 'RB-09',
    family: 'RB',
    label: 'Absolute-pin legality',
    diagnosis: 'Treats a piece pinned to its king as legally free to expose the king.',
    ratingPrior: [200, 800],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  },
  {
    id: 'RB-10',
    family: 'RB',
    label: 'Stalemate-rule knowledge',
    diagnosis: 'Cannot distinguish stalemate from checkmate or a playable position.',
    ratingPrior: [100, 550],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  },
  {
    id: 'RB-11',
    family: 'RB',
    label: 'Repetition-rule knowledge',
    diagnosis: 'Misunderstands threefold repetition or how it is applied online.',
    ratingPrior: [250, 1000],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  },
  {
    id: 'RB-12',
    family: 'RB',
    label: 'Fifty-move-rule knowledge',
    diagnosis: 'Does not know the no-pawn-move/no-capture counting condition.',
    ratingPrior: [500, 1500],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  },
  {
    id: 'RB-13',
    family: 'RB',
    label: 'Insufficient-material and timeout knowledge',
    diagnosis: 'Misunderstands drawing material or Chess.com timeout outcomes.',
    ratingPrior: [150, 900],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  },
  {
    id: 'RB-14',
    family: 'RB',
    label: 'Check, mate, and stalemate classification',
    diagnosis: 'Misclassifies static test positions despite seeing the legal moves.',
    ratingPrior: [100, 400],
    directions: ['N'],
    evidenceTrack: 'knowledge_inventory',
    detectability: 'probe',
    parentCategory: 'calculation_error'
  }
];
