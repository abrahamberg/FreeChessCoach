import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.R "Practical game-decision diagnostics". Per the family README:
 * `directions` default `['N']` (no label here starts with 'Own-'/'Opponent-'),
 * `evidenceTrack` is `'game_leak'` throughout (no entry's ratingPrior lower
 * bound reaches the 1400 curriculum threshold), `detectability` is always
 * `'dialogue'`, `parentCategory` is always `'no_plan'`.
 */
export const PD_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'PD-01',
    family: 'PD',
    label: 'Unjustified draw acceptance',
    diagnosis:
      'Accepts a draw in a position with meaningful winning chances without a conscious practical reason.',
    ratingPrior: [400, 2400],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'PD-02',
    family: 'PD',
    label: 'Unjustified draw refusal',
    diagnosis: 'Rejects a sound draw despite objective danger or match circumstances.',
    ratingPrior: [400, 2400],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'PD-03',
    family: 'PD',
    label: 'Premature resignation judgment',
    diagnosis: 'Resigns while significant objective or practical resources remain.',
    ratingPrior: [300, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'PD-04',
    family: 'PD',
    label: 'Repetition-choice misjudgment',
    diagnosis: 'Repeats or avoids repetition without correctly evaluating alternatives.',
    ratingPrior: [600, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'PD-05',
    family: 'PD',
    label: 'Risk-selection mismatch',
    diagnosis: 'Chooses a risk level inconsistent with the position and scoring situation.',
    ratingPrior: [800, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'PD-06',
    family: 'PD',
    label: 'Complexity-selection mismatch',
    diagnosis: 'Simplifies or complicates contrary to objective and practical needs.',
    ratingPrior: [900, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  }
];
