import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.G "Time management and mechanical execution" (TM-01..TM-17 only — the
 * "Interface and mechanical findings" subsection is the separate MX family).
 * Per the family README: `parentCategory` is always `'time_management'`,
 * `detectability` is always `'dialogue'`, `evidenceTrack` follows the
 * ratingPrior-threshold rule (none of TM's priors reach 1400, so every entry
 * is `'game_leak'`), and `directions` defaults `['N']` except TM-02
 * ("Opponent-rhythm entrainment", literally prefixed `'Opponent-'`) → `['D']`.
 */
export const TM_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'TM-01',
    family: 'TM',
    label: 'Critical-move impulse speed',
    diagnosis: 'Critical errors are played in seconds despite substantial remaining time.',
    ratingPrior: [200, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-02',
    family: 'TM',
    label: 'Opponent-rhythm entrainment',
    diagnosis: 'Replies become unusually fast when the opponent moves quickly.',
    ratingPrior: [200, 2200],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-03',
    family: 'TM',
    label: 'Time-to-complexity mismatch',
    diagnosis: 'Time expenditure correlates poorly with decision complexity.',
    ratingPrior: [400, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-04',
    family: 'TM',
    label: 'Forced-move overthinking',
    diagnosis: 'Excessive time is spent on nearly forced responses.',
    ratingPrior: [500, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-05',
    family: 'TM',
    label: 'Opening-time sink',
    diagnosis: 'Excessive early time produces no corresponding decision improvement.',
    ratingPrior: [500, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-06',
    family: 'TM',
    label: 'Missing middlegame reserve',
    diagnosis: 'Clock is repeatedly depleted before the main critical phase.',
    ratingPrior: [500, 2400],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-07',
    family: 'TM',
    label: 'Unused-clock blundering',
    diagnosis: 'Preventable rapid errors occur with substantial time remaining.',
    ratingPrior: [200, 2000],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-08',
    family: 'TM',
    label: 'Chronic time-trouble entry',
    diagnosis: 'Repeatedly reaches a defined phase below a safe clock threshold.',
    ratingPrior: [400, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-09',
    family: 'TM',
    label: 'Time-trouble blunder cascade',
    diagnosis: 'One low-time error is followed by several rapid errors.',
    ratingPrior: [300, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-10',
    family: 'TM',
    label: 'Clock-threshold performance drop',
    diagnosis: 'Quality falls sharply below a consistent clock threshold.',
    ratingPrior: [300, 2400],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-11',
    family: 'TM',
    label: 'Candidate cycling/perfectionism',
    diagnosis: 'Returns repeatedly to rejected lines while seeking certainty.',
    ratingPrior: [700, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-12',
    family: 'TM',
    label: 'Session-fatigue degradation',
    diagnosis: 'Opportunity-adjusted error rate rises in later games of a session.',
    ratingPrior: [100, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-13',
    family: 'TM',
    label: 'Fast-control habit transfer',
    diagnosis: 'Rapid games show blitz-like move times despite available clock.',
    ratingPrior: [200, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-14',
    family: 'TM',
    label: 'Premove misuse',
    diagnosis: 'Premove or near-premove behavior causes avoidable update errors.',
    ratingPrior: [100, 1600],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-15',
    family: 'TM',
    label: 'Distraction-conditioned error rate',
    diagnosis: 'Errors cluster in interrupted or multitasking sessions.',
    ratingPrior: [100, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-16',
    family: 'TM',
    label: 'Increment-use failure',
    diagnosis: 'Pacing fails to account for the presence or absence of increment.',
    ratingPrior: [300, 2400],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  },
  {
    id: 'TM-17',
    family: 'TM',
    label: 'Phase-transition clock failure',
    diagnosis: 'Time use does not adjust when the game enters a tactical or technical phase.',
    ratingPrior: [500, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'time_management'
  }
];
