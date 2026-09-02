import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.M "Defensive play". Per the family README: DF is a fixed-direction
 * family — every entry is `['D']` (defensive play is the defensive
 * application). `parentCategory` is always `'king_safety'`; no entry's
 * `ratingPrior` lower bound reaches 1400, so `evidenceTrack` is always
 * `'game_leak'`.
 */
export const DF_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'DF-01',
    family: 'DF',
    label: 'Actual-threat identification failure',
    diagnosis: 'Cannot state what the opponent will do next.',
    ratingPrior: [300, 1700],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-02',
    family: 'DF',
    label: 'Phantom-threat overreaction',
    diagnosis: 'Makes concessions against an unsound or nonexistent threat.',
    ratingPrior: [400, 1800],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-03',
    family: 'DF',
    label: 'Passive-default defense',
    diagnosis: 'Chooses only retreating or guarding moves without testing activity.',
    ratingPrior: [500, 2000],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-04',
    family: 'DF',
    label: 'Active-defense generation failure',
    diagnosis: 'Misses counterchecks, counterattacks, exchanges, or tactical defenses.',
    ratingPrior: [700, 2250],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-05',
    family: 'DF',
    label: 'Attacker-exchange failure',
    diagnosis: 'Does not consider removing the strongest attacking piece.',
    ratingPrior: [500, 1800],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-06',
    family: 'DF',
    label: 'Defender-reinforcement failure',
    diagnosis: 'Fails to add a defender when the target can be held.',
    ratingPrior: [400, 1600],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-07',
    family: 'DF',
    label: 'Target-evacuation failure',
    diagnosis: 'Adds defenders to a target that should move.',
    ratingPrior: [400, 1650],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-08',
    family: 'DF',
    label: 'Defensive-line-closing failure',
    diagnosis: 'Does not consider blocking a rank, file, or diagonal.',
    ratingPrior: [600, 2000],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-09',
    family: 'DF',
    label: 'King-flight-square creation failure',
    diagnosis: 'Misses a safe luft or escape-square move.',
    ratingPrior: [400, 1600],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-10',
    family: 'DF',
    label: 'Material-return aversion',
    diagnosis: 'Tries to retain material when returning some ends the attack.',
    ratingPrior: [650, 2100],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-11',
    family: 'DF',
    label: 'Counterplay-generation failure',
    diagnosis: 'Answers every threat directly instead of creating problems.',
    ratingPrior: [700, 2250],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-12',
    family: 'DF',
    label: 'Defensive only-move search failure',
    diagnosis: 'Does not enter rigorous resource-search mode when required.',
    ratingPrior: [950, 2450],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-13',
    family: 'DF',
    label: 'Defensive-simplification misjudgment',
    diagnosis: 'Trades into a lost ending or avoids a neutralizing exchange.',
    ratingPrior: [650, 2150],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-14',
    family: 'DF',
    label: 'Automatic queen-trade reflex',
    diagnosis: 'Assumes a queen exchange is always desirable when defending.',
    ratingPrior: [500, 1900],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-15',
    family: 'DF',
    label: 'King-relocation blindness',
    diagnosis: 'Defends the current king location when moving it is safest.',
    ratingPrior: [850, 2200],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-16',
    family: 'DF',
    label: 'Multiple-threat triage failure',
    diagnosis: 'Cannot identify which threat must be answered.',
    ratingPrior: [600, 2050],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-17',
    family: 'DF',
    label: 'Post-error collapse',
    diagnosis: 'One error is followed by unusually rapid deterioration.',
    ratingPrior: [200, 2200],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  },
  {
    id: 'DF-18',
    family: 'DF',
    label: 'Practical-resistance failure',
    diagnosis: 'Chooses passive losing lines instead of difficult human problems.',
    ratingPrior: [950, 2500],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'king_safety'
  }
];
