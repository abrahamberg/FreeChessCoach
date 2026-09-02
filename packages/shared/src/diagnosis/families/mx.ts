import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.G "Interface and mechanical findings". Per the family README:
 * `evidenceTrack` is always `'process_finding'`, `parentCategory` is always
 * `'premature_action'`, `directions` default `['N']` (no label here starts
 * with 'Own-'/'Opponent-'). `detectability` is `'unsupported'` for
 * MX-01..MX-03 and the default `'dialogue'` for MX-04.
 */
export const MX_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'MX-01',
    family: 'MX',
    label: 'Recurrent mouse/touch mis-input',
    diagnosis: 'Repeated input errors arise from a reproducible interface habit.',
    ratingPrior: [100, 2500],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'unsupported',
    parentCategory: 'premature_action'
  },
  {
    id: 'MX-02',
    family: 'MX',
    label: 'Board-orientation mapping failure',
    diagnosis: 'Accuracy changes substantially when the board is flipped.',
    ratingPrior: [100, 900],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'unsupported',
    parentCategory: 'premature_action'
  },
  {
    id: 'MX-03',
    family: 'MX',
    label: 'Coordinate-notation fluency gap',
    diagnosis: 'Slow coordinate retrieval interferes with study, communication, or calculation recording.',
    ratingPrior: [100, 1200],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'unsupported',
    parentCategory: 'premature_action'
  },
  {
    id: 'MX-04',
    family: 'MX',
    label: 'Move-confirmation omission',
    diagnosis: 'Student repeatedly commits an unintended move without final interface verification.',
    ratingPrior: [100, 2000],
    directions: ['N'],
    evidenceTrack: 'process_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  }
];
