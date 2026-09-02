import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.E "Tactical motif diagnostics". Per the family README: every entry
 * gets `directions: ['O', 'D']` (the section's own intro: "Test offensive
 * and defensive directions separately"), `parentCategory` is always
 * `'missed_tactic'`, `detectability` is always `'dialogue'`. No entry's
 * rating-prior lower bound reaches the 1400 curriculum-only threshold, so
 * `evidenceTrack` is `'game_leak'` throughout.
 */
export const TA_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'TA-01',
    family: 'TA',
    label: 'Mate-in-one recognition',
    diagnosis: 'An immediate legal mate is available or threatened.',
    ratingPrior: [100, 650],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-02',
    family: 'TA',
    label: 'Basic mate-in-two pattern',
    diagnosis: 'One forcing first move creates an elementary unavoidable mate.',
    ratingPrior: [250, 950],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-03',
    family: 'TA',
    label: 'Escape-square control',
    diagnosis: 'A mating net depends on controlling one or more flight squares.',
    ratingPrior: [450, 1500],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-04',
    family: 'TA',
    label: 'Back-rank weakness',
    diagnosis: 'King lacks luft and a major piece can enter the back rank.',
    ratingPrior: [350, 1250],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-05',
    family: 'TA',
    label: 'Smothered-mate pattern',
    diagnosis: 'Knight mating geometry exists against a boxed king.',
    ratingPrior: [500, 1450],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-06',
    family: 'TA',
    label: 'Fork/double-attack concept',
    diagnosis: 'Does not understand one unit attacking two valuable targets.',
    ratingPrior: [150, 650],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-07',
    family: 'TA',
    label: 'Knight-fork recognition',
    diagnosis: 'A knight can attack multiple valuable targets or threatens to do so.',
    ratingPrior: [300, 1200],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-08',
    family: 'TA',
    label: 'Pawn-fork recognition',
    diagnosis: 'A pawn advance or capture attacks multiple pieces.',
    ratingPrior: [300, 1200],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-09',
    family: 'TA',
    label: 'King-fork recognition',
    diagnosis: 'A safe king move attacks two pieces, usually after simplification.',
    ratingPrior: [450, 1450],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-10',
    family: 'TA',
    label: 'Sliding-piece double attack',
    diagnosis: 'A queen, rook, or bishop creates attacks on separate targets.',
    ratingPrior: [450, 1550],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-11',
    family: 'TA',
    label: 'Absolute-pin recognition',
    diagnosis: 'Moving the pinned unit would expose its king.',
    ratingPrior: [300, 1050],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-12',
    family: 'TA',
    label: 'Relative-pin recognition',
    diagnosis: 'Moving the pinned unit loses a more valuable non-king target.',
    ratingPrior: [450, 1350],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-13',
    family: 'TA',
    label: 'Exploiting a pinned defender',
    diagnosis: 'A pinned unit cannot adequately defend or recapture.',
    ratingPrior: [550, 1650],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-14',
    family: 'TA',
    label: 'Skewer recognition',
    diagnosis: 'A valuable front piece must move, exposing a rear target.',
    ratingPrior: [450, 1400],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-15',
    family: 'TA',
    label: 'X-ray recognition',
    diagnosis: 'A sliding unit attacks through an intervening unit or exchange.',
    ratingPrior: [600, 1750],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-16',
    family: 'TA',
    label: 'Discovered-attack recognition',
    diagnosis: 'Moving one unit reveals an attack by another.',
    ratingPrior: [450, 1500],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-17',
    family: 'TA',
    label: 'Discovered-check/double-check recognition',
    diagnosis: 'A revealed line gives check, possibly with the moving unit.',
    ratingPrior: [500, 1650],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-18',
    family: 'TA',
    label: 'Removal-of-defender recognition',
    diagnosis: 'A target becomes vulnerable after a defender is removed.',
    ratingPrior: [550, 1700],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-19',
    family: 'TA',
    label: 'Overload recognition',
    diagnosis: 'One defender has incompatible defensive duties.',
    ratingPrior: [700, 1900],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-20',
    family: 'TA',
    label: 'Deflection recognition',
    diagnosis: 'A defender is forced away from its duty.',
    ratingPrior: [700, 1950],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-21',
    family: 'TA',
    label: 'Decoy/attraction recognition',
    diagnosis: 'A piece is forced onto a tactically vulnerable square.',
    ratingPrior: [800, 2050],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-22',
    family: 'TA',
    label: 'Interference recognition',
    diagnosis: 'A move interrupts communication between attacker and defender.',
    ratingPrior: [950, 2250],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-23',
    family: 'TA',
    label: 'Square-clearance recognition',
    diagnosis: 'A unit moves or sacrifices itself to free a critical square.',
    ratingPrior: [750, 1950],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-24',
    family: 'TA',
    label: 'Line-clearance recognition',
    diagnosis: 'A unit vacates a rank, file, or diagonal for another piece.',
    ratingPrior: [850, 2100],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-25',
    family: 'TA',
    label: 'Line-opening/line-closing tactic',
    diagnosis: 'A move opens or closes a decisive line.',
    ratingPrior: [750, 2100],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-26',
    family: 'TA',
    label: 'Trapped-piece recognition',
    diagnosis: 'A piece lacks safe squares and can be won through restriction.',
    ratingPrior: [450, 1600],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-27',
    family: 'TA',
    label: 'Zwischenzug recognition',
    diagnosis: 'A forcing intermediate move is stronger than the expected recapture.',
    ratingPrior: [650, 1900],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-28',
    family: 'TA',
    label: 'Intermediate-check recognition',
    diagnosis: 'A check inserted before recapturing changes the sequence.',
    ratingPrior: [600, 1850],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-29',
    family: 'TA',
    label: 'Desperado recognition',
    diagnosis: 'A doomed unit gains material or tempo before capture.',
    ratingPrior: [700, 1900],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-30',
    family: 'TA',
    label: 'Promotion-tactic recognition',
    diagnosis: 'A promotion threat changes tactical priorities.',
    ratingPrior: [450, 1550],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-31',
    family: 'TA',
    label: 'Underpromotion recognition',
    diagnosis: 'Promotion to rook, bishop, or knight is uniquely superior.',
    ratingPrior: [950, 2250],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-32',
    family: 'TA',
    label: 'Stalemate-resource recognition',
    diagnosis: 'The losing side can remove its legal moves or sacrifice material.',
    ratingPrior: [450, 1650],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-33',
    family: 'TA',
    label: 'Perpetual-check recognition',
    diagnosis: 'Repeated checks force a draw or prevent a loss.',
    ratingPrior: [650, 2150],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-34',
    family: 'TA',
    label: 'Counter-tactic recognition',
    diagnosis: 'A threat should be answered by a stronger forcing threat.',
    ratingPrior: [750, 2200],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-35',
    family: 'TA',
    label: 'Defensive only-move tactic',
    diagnosis: 'One tactical resource uniquely avoids major loss.',
    ratingPrior: [950, 2400],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-36',
    family: 'TA',
    label: 'Quiet tactical move',
    diagnosis: 'The best tactical move is not a check, capture, or immediate threat.',
    ratingPrior: [1150, 2500],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-37',
    family: 'TA',
    label: 'Tactical move-order precision',
    diagnosis: 'Correct motifs are seen but played in the wrong sequence.',
    ratingPrior: [900, 2350],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-38',
    family: 'TA',
    label: 'Multi-motif combination',
    diagnosis: 'Final diagnosis names the exact combined motifs.',
    ratingPrior: [1200, 2500],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-39',
    family: 'TA',
    label: 'Tactical exchange sacrifice',
    diagnosis: 'Rook for minor piece creates concrete tactical gain or a forced attack.',
    ratingPrior: [1300, 2500],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-40',
    family: 'TA',
    label: 'Domination/trapping net',
    diagnosis: 'Several moves remove all useful squares from a piece.',
    ratingPrior: [1300, 2500],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-41',
    family: 'TA',
    label: 'Classic king-sacrifice pattern',
    diagnosis: 'Exact pattern required: Greek gift, h-file clearance, and so on.',
    ratingPrior: [750, 2150],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-42',
    family: 'TA',
    label: 'Defensive interposition tactic',
    diagnosis: 'A block or interposition neutralizes a line or forcing sequence.',
    ratingPrior: [550, 1900],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-43',
    family: 'TA',
    label: 'Loose-piece tactical targeting',
    diagnosis: 'The tactic begins by identifying an undefended or tactically loose unit.',
    ratingPrior: [300, 1350],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-44',
    family: 'TA',
    label: 'Named mating-pattern retrieval',
    diagnosis: 'Exact pattern required: Arabian, Anastasia, Boden, corridor, hook mate, etc.',
    ratingPrior: [450, 2200],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  },
  {
    id: 'TA-45',
    family: 'TA',
    label: 'Windmill/repeated discovered attack',
    diagnosis: 'Repeated discovered checks or attacks create a forcing material sequence.',
    ratingPrior: [800, 2100],
    directions: ['O', 'D'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'missed_tactic'
  }
];
