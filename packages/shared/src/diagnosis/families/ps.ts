import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.P "Performance-state and decision-bias diagnostics". Per the family
 * README: `evidenceTrack` is always `'state_finding'`, `detectability` is
 * always `'dialogue'`, `parentCategory` is always `'premature_action'`.
 * `directions` default `['N']` — no label here literally starts with
 * 'Own-'/'Opponent-' (a few mention "opponent" mid-label, which the rule
 * does not match).
 */
export const PS_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'PS-01',
    family: 'PS',
    label: 'Hope-chess decision pattern',
    diagnosis: 'Suspects a reply but plays as if it will not occur.',
    ratingPrior: [400, 2300],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-02',
    family: 'PS',
    label: 'Attack tunnel vision',
    diagnosis: 'Opponent threats disappear once an attack begins.',
    ratingPrior: [400, 2400],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-03',
    family: 'PS',
    label: 'Confirmation bias',
    diagnosis: 'Searches for support while avoiding refutation.',
    ratingPrior: [600, 2500],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-04',
    family: 'PS',
    label: 'Sunk-cost plan persistence',
    diagnosis: 'Continues a plan mainly because resources were already invested.',
    ratingPrior: [600, 2500],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-05',
    family: 'PS',
    label: 'Attack-pressure performance drop',
    diagnosis: 'Speed rises and candidate breadth falls under king pressure.',
    ratingPrior: [200, 2500],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-06',
    family: 'PS',
    label: 'Post-blunder state degradation',
    diagnosis: 'Error rate rises immediately after recognizing a mistake.',
    ratingPrior: [200, 2500],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-07',
    family: 'PS',
    label: 'Post-loss carryover',
    diagnosis: 'Next-game performance drops beyond fatigue and opponent effects.',
    ratingPrior: [200, 2500],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-08',
    family: 'PS',
    label: 'Higher-rated-opponent effect',
    diagnosis: 'Decision quality changes specifically against much stronger opposition.',
    ratingPrior: [400, 2500],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-09',
    family: 'PS',
    label: 'Lower-rated-opponent overconfidence',
    diagnosis: 'Risk and speed rise without chess justification.',
    ratingPrior: [300, 2500],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-10',
    family: 'PS',
    label: 'Winning-position fear',
    diagnosis: 'Choices become passive and clock use rises sharply while ahead.',
    ratingPrior: [400, 2500],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-11',
    family: 'PS',
    label: 'Quiet-position autopilot',
    diagnosis: 'Errors cluster in equal, low-tactical-intensity positions.',
    ratingPrior: [300, 2500],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-12',
    family: 'PS',
    label: 'Loss-aversion trade avoidance',
    diagnosis: 'Rejects favorable exchanges because surrendering material feels unsafe.',
    ratingPrior: [600, 2500],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-13',
    family: 'PS',
    label: 'Compulsive simplification',
    diagnosis: 'Seeks exchanges regardless of the resulting position.',
    ratingPrior: [400, 2400],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-14',
    family: 'PS',
    label: 'Uncertainty-intolerance pattern',
    diagnosis: 'Spends excessive time trying to prove noncritical decisions completely.',
    ratingPrior: [600, 2500],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-15',
    family: 'PS',
    label: 'Result-based evaluation bias',
    diagnosis: 'Judges moves mainly by the game result.',
    ratingPrior: [400, 2500],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-16',
    family: 'PS',
    label: 'Emotion-linked premature resignation',
    diagnosis:
      'Resigns due to emotional collapse despite known resources. Use PD-03 if the issue is objective position assessment.',
    ratingPrior: [300, 2300],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  },
  {
    id: 'PS-17',
    family: 'PS',
    label: 'Instant-rematch tilt',
    diagnosis: 'Immediate rematches after emotional losses show a repeatable decline.',
    ratingPrior: [200, 2400],
    directions: ['N'],
    evidenceTrack: 'state_finding',
    detectability: 'dialogue',
    parentCategory: 'premature_action'
  }
];
