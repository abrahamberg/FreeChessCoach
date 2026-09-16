import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.J "Strategic planning and piece play". Per the family README:
 * `parentCategory` is always `'no_plan'`, `detectability` is always
 * `'dialogue'`. `directions` uses the general own/opponent-prefix rule
 * (only ST-03 matches, "Opponent-plan..." -> `['D']`; the rest `['N']`).
 * `evidenceTrack` uses the ratingPrior >=1400 threshold rule (ST-32 and
 * ST-33 cross it -> `'curriculum_only_gap'`; the rest `'game_leak'`).
 */
export const ST_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'ST-01',
    family: 'ST',
    label: 'Aimless play after opening',
    diagnosis: 'Cannot name a target, improving piece, break, or opponent plan.',
    ratingPrior: [450, 1500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-02',
    family: 'ST',
    label: 'Worst-piece identification failure',
    diagnosis: 'Improves active pieces while one piece remains ineffective.',
    ratingPrior: [550, 1700],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-03',
    family: 'ST',
    label: 'Opponent-plan identification failure',
    diagnosis: "Names own plans but omits the opponent's plans and breaks.",
    ratingPrior: [700, 2300],
    directions: ['D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-04',
    family: 'ST',
    label: 'Piece-activity improvement failure',
    diagnosis: 'Exact piece and improvement route must be named.',
    ratingPrior: [650, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-05',
    family: 'ST',
    label: 'Open-file use failure',
    diagnosis: 'Fails to occupy or contest a useful open file.',
    ratingPrior: [600, 1800],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-06',
    family: 'ST',
    label: 'File-entry-square blindness',
    diagnosis: 'Occupies a file but does not identify penetration squares.',
    ratingPrior: [850, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-07',
    family: 'ST',
    label: 'Rook-activation failure',
    diagnosis: 'Rooks remain passive despite accessible files, ranks, or pawn support.',
    ratingPrior: [600, 2000],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-08',
    family: 'ST',
    label: 'Rook-coordination failure',
    diagnosis: 'Rooks cannot support one another or are doubled without purpose.',
    ratingPrior: [750, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-09',
    family: 'ST',
    label: 'Knight-outpost recognition failure',
    diagnosis: 'Misses a stable square that cannot be challenged by pawns.',
    ratingPrior: [650, 1950],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-10',
    family: 'ST',
    label: 'Knight-rerouting failure',
    diagnosis: 'Identifies a poor knight but cannot find a practical route.',
    ratingPrior: [850, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-11',
    family: 'ST',
    label: 'Bad-bishop recognition failure',
    diagnosis: 'Does not recognize restriction by its own pawns or blocked diagonals.',
    ratingPrior: [550, 1700],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-12',
    family: 'ST',
    label: 'Bad-bishop improvement failure',
    diagnosis: 'Recognizes the problem but finds no exchange, break, or reroute.',
    ratingPrior: [750, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-13',
    family: 'ST',
    label: 'Bishop-pair utilization failure',
    diagnosis: 'Keeps the position closed or exchanges the wrong bishop.',
    ratingPrior: [950, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-14',
    family: 'ST',
    label: 'Queen-placement failure',
    diagnosis: 'Queen blocks pieces, becomes a target, or lacks coordination.',
    ratingPrior: [850, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-15',
    family: 'ST',
    label: 'Piece-coordination failure',
    diagnosis: 'Pieces pursue unrelated targets or obstruct one another.',
    ratingPrior: [750, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-16',
    family: 'ST',
    label: 'Space-advantage utilization failure',
    diagnosis: 'Cannot improve pieces, restrict counterplay, or prepare a break.',
    ratingPrior: [750, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-17',
    family: 'ST',
    label: 'Cramped-position handling failure',
    diagnosis: 'Makes passive moves without seeking exchanges, breaks, or coordination.',
    ratingPrior: [850, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-18',
    family: 'ST',
    label: 'Weak-square exploitation failure',
    diagnosis: 'Identifies a weak square but cannot occupy or use it.',
    ratingPrior: [750, 2050],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-19',
    family: 'ST',
    label: 'Color-complex control failure',
    diagnosis: 'Fails to connect pawn moves and exchanges to long-term square control.',
    ratingPrior: [1050, 2450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-20',
    family: 'ST',
    label: 'Fixed-target creation failure',
    diagnosis: 'Cannot convert temporary pressure into a stable target.',
    ratingPrior: [850, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-21',
    family: 'ST',
    label: 'Second-weakness creation failure',
    diagnosis: 'Attacks one defended target without opening another front.',
    ratingPrior: [1200, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-22',
    family: 'ST',
    label: 'Wing-switch timing failure',
    diagnosis: 'Switches too early, too late, or not at all.',
    ratingPrior: [1050, 2450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-23',
    family: 'ST',
    label: 'Favorable-exchange identification failure',
    diagnosis: 'Exchanges by nominal value instead of resulting position.',
    ratingPrior: [650, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-24',
    family: 'ST',
    label: 'Key-piece preservation failure',
    diagnosis: "Trades the piece essential to the position's plan or defense.",
    ratingPrior: [850, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-25',
    family: 'ST',
    label: 'Premature tension-release reflex',
    diagnosis: 'Captures automatically without comparing maintenance of tension.',
    ratingPrior: [550, 1950],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-26',
    family: 'ST',
    label: 'Tension-maintenance failure',
    diagnosis: 'Cannot identify when waiting improves the position.',
    ratingPrior: [850, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-27',
    family: 'ST',
    label: 'Irreversible-pawn-commitment failure',
    diagnosis: 'Makes pawn moves without assessing permanent weaknesses.',
    ratingPrior: [700, 2150],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-28',
    family: 'ST',
    label: 'Counterplay-restriction failure',
    diagnosis: "Pursues an advantage without suppressing the opponent's active plan.",
    ratingPrior: [950, 2450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-29',
    family: 'ST',
    label: 'Positional-transformation failure',
    diagnosis: 'Misses the moment to alter structure, exchange, or convert advantages.',
    ratingPrior: [1150, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-30',
    family: 'ST',
    label: 'Plan-inertia failure',
    diagnosis: 'Continues an old plan after defining features change.',
    ratingPrior: [850, 2350],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-31',
    family: 'ST',
    label: 'Position-reevaluation failure',
    diagnosis: 'Does not reassess after exchanges, breaks, or king-safety changes.',
    ratingPrior: [950, 2450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-32',
    family: 'ST',
    label: 'Strategic move-order failure',
    diagnosis: 'Correct strategic operations are played in the wrong sequence.',
    ratingPrior: [1500, 2500],
    directions: ['N'],
    evidenceTrack: 'curriculum_only_gap',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-33',
    family: 'ST',
    label: 'Second-order prophylaxis failure',
    diagnosis: 'Anticipates the first opposing plan but not the response after prevention.',
    ratingPrior: [1800, 2500],
    directions: ['N'],
    evidenceTrack: 'curriculum_only_gap',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-34',
    family: 'ST',
    label: 'Central-break selection failure',
    diagnosis: 'Misses or mistimes the central operation required by the position.',
    ratingPrior: [650, 2200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  },
  {
    id: 'ST-35',
    family: 'ST',
    label: 'Strategic target-priority failure',
    diagnosis: 'Identifies several targets but selects the least useful one.',
    ratingPrior: [700, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'no_plan'
  }
];
