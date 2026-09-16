import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.K "Pawn play and pawn structures" — the main table (PW-01..PW-22) plus
 * the "Named-structure families" table (PW-23..PW-33), which has no separate
 * `diagnosis` sentence in the spec, so its "Structure-side family" column is
 * reused verbatim for both `label` and `diagnosis`. Per the family README:
 * `directions` default `['N']` (no label starts with 'Own-'/'Opponent-' —
 * "playing with/against" doesn't count), `parentCategory` is always
 * `'pawn_structure'`, `detectability` is always `'dialogue'`, and no entry's
 * ratingPrior lower bound reaches the 1400 curriculum-only threshold, so
 * `evidenceTrack` is `'game_leak'` throughout.
 */
export const PW_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'PW-01',
    family: 'PW',
    label: 'Playing with an IQP',
    diagnosis: 'Misunderstands activity, breaks, placement, or liquidation.',
    ratingPrior: [800, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-02',
    family: 'PW',
    label: 'Playing against an IQP',
    diagnosis: 'Fails to blockade, exchange correctly, or pressure the pawn.',
    ratingPrior: [850, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-03',
    family: 'PW',
    label: 'Playing with hanging pawns',
    diagnosis: 'Mismanages dynamic advance, space, or future weakness.',
    ratingPrior: [1000, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-04',
    family: 'PW',
    label: 'Playing against hanging pawns',
    diagnosis: 'Cannot provoke, blockade, or target them appropriately.',
    ratingPrior: [1000, 2350],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-05',
    family: 'PW',
    label: 'Backward-pawn handling',
    diagnosis: 'Exact direction required: playing with it or attacking it.',
    ratingPrior: [750, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-06',
    family: 'PW',
    label: 'Doubled-pawn evaluation and use',
    diagnosis: 'Treats doubled pawns as automatically bad or ignores their benefits.',
    ratingPrior: [550, 1900],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-07',
    family: 'PW',
    label: 'Pawn-chain base/head confusion',
    diagnosis: 'Attacks or defends the wrong part of a chain.',
    ratingPrior: [500, 1600],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-08',
    family: 'PW',
    label: 'Closed-center wing choice',
    diagnosis: 'Chooses the wrong wing or ignores chain direction and king placement.',
    ratingPrior: [700, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-09',
    family: 'PW',
    label: 'Open-center obligation failure',
    diagnosis: 'Makes slow flank moves while central development or safety is urgent.',
    ratingPrior: [550, 1800],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-10',
    family: 'PW',
    label: 'Minority-attack schema gap',
    diagnosis: 'Does not understand the target, exchanges, or resulting weakness.',
    ratingPrior: [900, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-11',
    family: 'PW',
    label: 'Passed-pawn creation failure',
    diagnosis: 'Misses exchanges or breaks that create a passer.',
    ratingPrior: [550, 1900],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-12',
    family: 'PW',
    label: 'Passed-pawn blockade failure',
    diagnosis: 'Fails to stop a passer before it becomes tactically dangerous.',
    ratingPrior: [450, 1800],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-13',
    family: 'PW',
    label: 'Outside-passed-pawn recognition',
    diagnosis: 'Does not value or create a distant passer.',
    ratingPrior: [700, 2050],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-14',
    family: 'PW',
    label: 'Connected/protected-passer handling',
    diagnosis: 'Misjudges when passers should advance or be blockaded.',
    ratingPrior: [700, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-15',
    family: 'PW',
    label: 'Majority/candidate-passer recognition',
    diagnosis: 'Cannot identify which pawn can become passed after exchanges.',
    ratingPrior: [650, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-16',
    family: 'PW',
    label: 'Pawn-lever identification failure',
    diagnosis: 'Misses the pawn contact that can alter the structure.',
    ratingPrior: [650, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-17',
    family: 'PW',
    label: 'Pawn-break preparation failure',
    diagnosis: 'Finds the break but plays it before pieces support it.',
    ratingPrior: [800, 2350],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-18',
    family: 'PW',
    label: 'Pawn-break timing failure',
    diagnosis: 'Conceptually correct break is mistimed.',
    ratingPrior: [900, 2450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-19',
    family: 'PW',
    label: 'Pawn-overextension failure',
    diagnosis: 'Gains space while creating unsupported pawns or weak squares.',
    ratingPrior: [500, 1800],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-20',
    family: 'PW',
    label: 'Pawn-island/fixed-target blindness',
    diagnosis: 'Cannot distinguish mobile weaknesses from fixed targets.',
    ratingPrior: [500, 1600],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-21',
    family: 'PW',
    label: 'Reserve-tempo blindness',
    diagnosis: 'Uses pawn moves without recognizing their waiting-move value.',
    ratingPrior: [800, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-22',
    family: 'PW',
    label: 'Pawn-race counting failure',
    diagnosis: 'Miscounts promotion tempi, checks, or king routes.',
    ratingPrior: [400, 1500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-23',
    family: 'PW',
    label: 'Carlsbad: minority-attack side',
    diagnosis: 'Carlsbad: minority-attack side',
    ratingPrior: [900, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-24',
    family: 'PW',
    label: 'Carlsbad: defending against minority attack',
    diagnosis: 'Carlsbad: defending against minority attack',
    ratingPrior: [1000, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-25',
    family: 'PW',
    label: 'Maróczy Bind: space-side plans',
    diagnosis: 'Maróczy Bind: space-side plans',
    ratingPrior: [1150, 2450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-26',
    family: 'PW',
    label: 'Maróczy Bind: break-side plans',
    diagnosis: 'Maróczy Bind: break-side plans',
    ratingPrior: [1250, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-27',
    family: 'PW',
    label: 'Hedgehog: space-side restraint and breakthrough',
    diagnosis: 'Hedgehog: space-side restraint and breakthrough',
    ratingPrior: [1350, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-28',
    family: 'PW',
    label: 'Hedgehog: break-side preparation',
    diagnosis: 'Hedgehog: break-side preparation',
    ratingPrior: [1350, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-29',
    family: 'PW',
    label: 'French chain: attacking base versus head',
    diagnosis: 'French chain: attacking base versus head',
    ratingPrior: [700, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-30',
    family: 'PW',
    label: "Locked King's Indian center: wing race",
    diagnosis: "Locked King's Indian center: wing race",
    ratingPrior: [950, 2350],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-31',
    family: 'PW',
    label: 'Benoni: breaks, majorities, and weak squares',
    diagnosis: 'Benoni: breaks, majorities, and weak squares',
    ratingPrior: [1050, 2450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-32',
    family: 'PW',
    label: 'Stonewall: bishop problem and key squares',
    diagnosis: 'Stonewall: bishop problem and key squares',
    ratingPrior: [850, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  },
  {
    id: 'PW-33',
    family: 'PW',
    label: 'Symmetrical structure: creating timely asymmetry',
    diagnosis: 'Symmetrical structure: creating timely asymmetry',
    ratingPrior: [1200, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'pawn_structure'
  }
];
