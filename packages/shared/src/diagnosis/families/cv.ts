import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.N "Advantage conversion". Per the family README: no label starts with
 * 'Own-'/'Opponent-', so `directions` defaults to `['N']` throughout;
 * `parentCategory` is always `'no_plan'`; `detectability` is always
 * `'dialogue'`; no entry's `ratingPrior` lower bound reaches 1400, so
 * `evidenceTrack` is always `'game_leak'`.
 */
export const CV_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'CV-01',
    family: 'CV',
    label: 'Forced-win rushing',
    diagnosis: 'Searches for immediate tactics when simple improvement preserves the edge.',
    ratingPrior: [500, 1800],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-02',
    family: 'CV',
    label: 'Counterplay-suppression failure',
    diagnosis: "Does not remove the opponent's only active resource.",
    ratingPrior: [700, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-03',
    family: 'CV',
    label: 'Wrong-liquidation failure',
    diagnosis: 'Exchanges into an ending that reduces or removes the advantage.',
    ratingPrior: [700, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-04',
    family: 'CV',
    label: '"Trade pieces, not pawns" misuse',
    diagnosis: 'Applies a conversion rule without evaluating the result.',
    ratingPrior: [500, 1900],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-05',
    family: 'CV',
    label: 'Active-piece neutralization failure',
    diagnosis: 'Allows one enemy piece to maintain counterplay.',
    ratingPrior: [800, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-06',
    family: 'CV',
    label: 'Winning-side king-activation failure',
    diagnosis: 'Leaves the king passive after major danger has passed.',
    ratingPrior: [500, 1800],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-07',
    family: 'CV',
    label: 'Passed-pawn creation failure',
    diagnosis: 'Does not convert an edge into a passer.',
    ratingPrior: [600, 1900],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-08',
    family: 'CV',
    label: 'Extra-pawn conversion technique',
    diagnosis: 'Fails specifically in technically favorable one-pawn-up positions.',
    ratingPrior: [600, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-09',
    family: 'CV',
    label: 'Extra-exchange conversion technique',
    diagnosis: 'Mismanages rook versus minor piece or pawn exchanges.',
    ratingPrior: [850, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-10',
    family: 'CV',
    label: 'Extra-piece conversion technique',
    diagnosis: 'Allows forks, perpetuals, or excessive pawn liquidation.',
    ratingPrior: [400, 1700],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-11',
    family: 'CV',
    label: 'Winning-position clock misuse',
    diagnosis: 'Plays too quickly or seeks unnecessary perfection.',
    ratingPrior: [500, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-12',
    family: 'CV',
    label: 'Winning-position overconfidence',
    diagnosis: 'Threat checks and calculation quality decline while ahead.',
    ratingPrior: [400, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-13',
    family: 'CV',
    label: 'Winning-position fear/passivity',
    diagnosis: 'Stops active play and permits counterplay.',
    ratingPrior: [650, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-14',
    family: 'CV',
    label: 'Advantage-reevaluation failure',
    diagnosis: 'Continues as if the original advantage still exists.',
    ratingPrior: [900, 2450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-15',
    family: 'CV',
    label: 'Two-weakness conversion failure',
    diagnosis: 'Cannot create or alternate between two targets.',
    ratingPrior: [1200, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-16',
    family: 'CV',
    label: 'Overwhelming-material simplification failure',
    diagnosis: 'Fails to reduce tactical risk while retaining an elementary material win.',
    ratingPrior: [250, 1200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'CV-17',
    family: 'CV',
    label: 'Stalemate-safe conversion failure',
    diagnosis: 'Conversion repeatedly permits or nearly permits stalemate.',
    ratingPrior: [200, 1000],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  }
];
