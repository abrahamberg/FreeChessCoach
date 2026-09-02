import type { DiagnosisCodeEntry } from '../catalog-types.js';

/**
 * §II.I "Evaluation diagnostics". Per the family README: `directions`
 * default `['N']` (no label here starts with 'Own-'/'Opponent-'),
 * `parentCategory` is always `'calculation_error'`, `detectability` is
 * always `'dialogue'`. `evidenceTrack` follows the ratingPrior-threshold
 * rule; every entry's lower bound stays under 1400, so it is `'game_leak'`
 * throughout.
 */
export const EV_CODES: readonly DiagnosisCodeEntry[] = [
  {
    id: 'EV-01',
    family: 'EV',
    label: 'Current-material counting failure',
    diagnosis: 'Cannot state the present material balance correctly.',
    ratingPrior: [200, 750],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-02',
    family: 'EV',
    label: 'Contextual piece-value failure',
    diagnosis: 'Uses fixed numerical values despite trapping, promotion, or mating conditions.',
    ratingPrior: [300, 1200],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-03',
    family: 'EV',
    label: 'Exchange-arithmetic failure',
    diagnosis: 'Miscalculates material after a straightforward exchange sequence.',
    ratingPrior: [250, 1100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-04',
    family: 'EV',
    label: 'King-safety underweighting',
    diagnosis: 'Prefers material or structure while underestimating king exposure.',
    ratingPrior: [400, 1700],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-05',
    family: 'EV',
    label: 'Phantom-attack overvaluation',
    diagnosis: 'Overvalues an attack with too few attackers or insufficient access.',
    ratingPrior: [500, 1800],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-06',
    family: 'EV',
    label: 'Development/tempo undervaluation',
    diagnosis: 'Treats early material gains as free while ignoring initiative.',
    ratingPrior: [300, 1100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-07',
    family: 'EV',
    label: 'Piece-activity valuation failure',
    diagnosis: 'Exact piece and activity feature must be named.',
    ratingPrior: [550, 1900],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-08',
    family: 'EV',
    label: 'Space-advantage valuation failure',
    diagnosis: 'Ignores useful space or overvalues space without breaks and access.',
    ratingPrior: [650, 2000],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-09',
    family: 'EV',
    label: 'Pawn-weakness severity misjudgment',
    diagnosis: 'Exact weakness required: isolated, backward, doubled, fixed, etc.',
    ratingPrior: [650, 2100],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-10',
    family: 'EV',
    label: 'Initiative-versus-material misjudgment',
    diagnosis: 'Misweights temporary activity against lasting material.',
    ratingPrior: [850, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-11',
    family: 'EV',
    label: 'Pawn-sacrifice compensation misjudgment',
    diagnosis: 'Weights development, files, king safety, or structure incorrectly.',
    ratingPrior: [950, 2350],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-12',
    family: 'EV',
    label: 'Exchange-sacrifice compensation misjudgment',
    diagnosis: 'Misvalues rook versus minor piece plus activity or control.',
    ratingPrior: [1150, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-13',
    family: 'EV',
    label: 'Bishop-pair valuation failure',
    diagnosis: 'Overvalues or undervalues the pair relative to structure and openness.',
    ratingPrior: [850, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-14',
    family: 'EV',
    label: 'Bishop-versus-knight misjudgment',
    diagnosis: 'Evaluates nominal type rather than squares, pawns, and mobility.',
    ratingPrior: [750, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-15',
    family: 'EV',
    label: 'Queen-versus-pieces imbalance misjudgment',
    diagnosis: 'Misvalues queen against rooks or several minor pieces.',
    ratingPrior: [1200, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-16',
    family: 'EV',
    label: 'Exchange-imbalance misjudgment',
    diagnosis: 'Misvalues rook versus minor piece and pawns.',
    ratingPrior: [900, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-17',
    family: 'EV',
    label: 'Static-versus-dynamic weighting failure',
    diagnosis: 'Overweights permanent features or temporary initiative.',
    ratingPrior: [1350, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-18',
    family: 'EV',
    label: 'Endgame-transition evaluation failure',
    diagnosis: 'Misjudges whether an exchange enters a favorable ending.',
    ratingPrior: [900, 2450],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-19',
    family: 'EV',
    label: 'Fortress/drawability evaluation failure',
    diagnosis: 'Treats an engine advantage as winning despite a drawing mechanism.',
    ratingPrior: [1350, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-20',
    family: 'EV',
    label: 'Opposite-colored-bishop drawability',
    diagnosis: 'Fails to adjust winning expectations appropriately.',
    ratingPrior: [900, 2250],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-21',
    family: 'EV',
    label: 'Evaluation-confidence miscalibration',
    diagnosis: 'Confidence remains high in repeatedly unreliable position types.',
    ratingPrior: [1200, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-22',
    family: 'EV',
    label: 'Passed-pawn valuation failure',
    diagnosis: "Misvalues a passer's speed, support, blockadability, or promotion potential.",
    ratingPrior: [500, 1900],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-23',
    family: 'EV',
    label: 'Win/draw/loss classification failure',
    diagnosis: 'Misclassifies the objective result class of a stable position.',
    ratingPrior: [650, 2300],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  },
  {
    id: 'EV-24',
    family: 'EV',
    label: 'Objective-versus-practical risk misjudgment',
    diagnosis: 'Chooses an objectively narrow line without accounting for practical risk.',
    ratingPrior: [1200, 2500],
    directions: ['N'],
    evidenceTrack: 'game_leak',
    detectability: 'dialogue',
    parentCategory: 'calculation_error'
  }
];
