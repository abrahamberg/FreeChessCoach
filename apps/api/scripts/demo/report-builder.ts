import {
  GameReportSchema,
  MOVE_QUALITIES,
  type BookReport,
  type ClassificationCounts,
  type ClassifiedMoveDto,
  type EndgameStanding,
  type GameReport,
  type MoveQuality,
  type PlayerColor,
  type PlayerReport
} from '@freechesscoach/shared';
import type { DemoOpening } from './openings.js';
import { clamp, gaussian, pickWeighted, type Rng } from './rng.js';
import { accuracyAt, ENDGAME_THEME_PROFILE, phaseOffsets, strategyOffsets, tacticCountsForGame } from './skill-model.js';

export type DemoResult = 'win' | 'loss' | 'draw';

export interface DemoGameInput {
  /** This game's estimated rating for the player (already carries the noise). */
  estimatedRating: number;
  opponentRating: number;
  userColor: PlayerColor;
  result: DemoResult;
  opening: DemoOpening;
  reachedEndgame: boolean;
}

const BOOK_SOURCE = 'lichess-chess-openings@2024.01';

function percent(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function zeroCounts(): ClassificationCounts {
  return Object.fromEntries(MOVE_QUALITIES.map((quality) => [quality, 0])) as ClassificationCounts;
}

/** Distributes a game's moves over the quality tiers, skewed better for higher accuracy. */
function classificationCounts(rng: Rng, total: number, accuracy: number): ClassificationCounts {
  const counts = zeroCounts();
  const goodShare = (accuracy - 40) / 60;
  for (let i = 0; i < total; i++) {
    const roll = rng();
    const quality: MoveQuality =
      roll < 0.08 ? 'book'
      : roll < 0.08 + 0.2 * goodShare ? 'best'
      : roll < 0.08 + 0.42 * goodShare ? 'excellent'
      : roll < 0.08 + 0.7 * goodShare ? 'good'
      : roll < 0.9 ? 'inaccuracy'
      : roll < 0.96 ? 'mistake'
      : 'blunder';
    counts[quality] += 1;
  }
  return counts;
}

function endgameStanding(rng: Rng, result: DemoResult): EndgameStanding {
  const weights: Record<DemoResult, [EndgameStanding, number][]> = {
    win: [['winning', 75], ['equal', 20], ['worse', 5]],
    draw: [['equal', 65], ['worse', 20], ['winning', 15]],
    loss: [['worse', 70], ['equal', 25], ['winning', 5]]
  };
  return pickWeighted(rng, weights[result].map(([item, weight]) => ({ item, weight })));
}

function buildPlayerReport(rng: Rng, rating: number, result: DemoResult, reachedEndgame: boolean, openingSkill: number, isUser: boolean): PlayerReport {
  const resultLift = result === 'win' ? 2.5 : result === 'loss' ? -2.5 : 0;
  const accuracy = percent(gaussian(rng, accuracyAt(rating) + openingSkill * 0.4 + resultLift, 3));
  const offsets = phaseOffsets(rating);
  const theme = pickWeighted(rng, ENDGAME_THEME_PROFILE.map((profile) => ({ item: profile, weight: profile.weight })));
  const endgameAccuracy = reachedEndgame ? percent(gaussian(rng, accuracy + offsets.endgame + theme.skill, 5)) : null;
  const openingAccuracy = percent(gaussian(rng, accuracy + offsets.opening + openingSkill * 0.6, 4));
  const middlegameAccuracy = percent(gaussian(rng, accuracy + offsets.middlegame, 4));
  const strategy = strategyOffsets(rating);
  const subScore = (offset: number) => (isUser && rng() < 0.12 ? null : percent(gaussian(rng, accuracy + offset, 6)));
  const overallStrategy = percent(gaussian(rng, accuracy - 1, 4));

  return {
    accuracy,
    phaseAccuracy: { opening: openingAccuracy, middlegame: middlegameAccuracy, endgame: endgameAccuracy },
    phaseConfidence: { opening: 'ok', middlegame: 'ok', endgame: reachedEndgame ? 'ok' : 'none' },
    scores: {
      opening: openingAccuracy,
      tactics: percent(gaussian(rng, accuracy - 2, 5)),
      strategy: overallStrategy,
      endgame: endgameAccuracy
    },
    strategySubScores: {
      pawnStructure: subScore(strategy.pawnStructure),
      spaceAdvantage: subScore(strategy.spaceAdvantage),
      activePiece: subScore(strategy.activePiece),
      attacking: subScore(strategy.attacking),
      defending: subScore(strategy.defending)
    },
    endgame: reachedEndgame ? { standing: endgameStanding(rng, result), theme: theme.theme } : { standing: null, theme: null },
    counts: classificationCounts(rng, 26 + Math.floor(rng() * 22), accuracy),
    acpl: Math.round(clamp(gaussian(rng, 95 - accuracy * 0.85, 6), 8, 220)),
    estimatedRating: {
      value: Math.round(rating),
      range: [Math.round(rating - 110), Math.round(rating + 110)],
      confidence: 'medium'
    },
    tacticMotifs: tacticCountsForGame(rng, rating)
  };
}

function bookReport(opening: DemoOpening, whiteBookPly: number, blackBookPly: number): BookReport {
  const side = (lastBookPly: number) => ({
    lastBookPly,
    leftBookPly: lastBookPly + 1,
    leftBookMove: opening.plies[lastBookPly] ?? null,
    bookAlternatives: [] as string[]
  });
  return {
    source: BOOK_SOURCE,
    eco: opening.eco,
    ecoVolume: (opening.eco?.[0] ?? null) as BookReport['ecoVolume'],
    name: opening.name,
    family: opening.family,
    variation: opening.variation,
    namedAtPly: opening.name ? 4 : null,
    lastBookPly: Math.min(whiteBookPly, blackBookPly),
    players: { white: side(whiteBookPly), black: side(blackBookPly) }
  };
}

/** The opening plies as classified moves: book while both players know the
 * line, then good moves with the odd slip — enough for the Stats page's
 * "opening mistakes" figure to be a real count rather than a flat zero. */
function openingMoves(rng: Rng, opening: DemoOpening, userColor: PlayerColor, rating: number, userBookPly: number): ClassifiedMoveDto[] {
  const slipChance = clamp(0.32 - rating / 9000, 0.06, 0.3);
  return opening.plies.map((san, index): ClassifiedMoveDto => {
    const ply = index + 1;
    const mover: PlayerColor = ply % 2 === 1 ? 'white' : 'black';
    const isUserMove = mover === userColor;
    const inBook = !isUserMove || ply <= userBookPly;
    const slipped = !inBook && rng() < slipChance;
    const quality: MoveQuality = inBook ? 'book' : slipped ? (rng() < 0.7 ? 'inaccuracy' : 'mistake') : rng() < 0.5 ? 'best' : 'good';
    const cpLoss = quality === 'inaccuracy' ? 55 + Math.floor(rng() * 40) : quality === 'mistake' ? 110 + Math.floor(rng() * 90) : Math.floor(rng() * 14);
    return {
      ply,
      moveNumber: Math.ceil(ply / 2),
      moveSan: san,
      mover,
      isUserMove,
      cpLoss,
      quality,
      bestLineSan: [],
      evalAfterCp: Math.round(gaussian(rng, 20, 40)),
      hangsPiece: false,
      phase: 'opening'
    };
  });
}

export interface DemoReport {
  report: GameReport;
  userBookPly: number;
}

export function buildDemoReport(rng: Rng, input: DemoGameInput): DemoReport {
  const { estimatedRating, opening, userColor, result, reachedEndgame } = input;
  const userBookPly = Math.round(clamp(gaussian(rng, 4 + (estimatedRating - 450) / 140, 1.5), 2, Math.min(opening.plies.length, 20)));
  const opponentBookPly = Math.round(clamp(gaussian(rng, 8, 2), 3, opening.plies.length));
  const opponentResult: DemoResult = result === 'win' ? 'loss' : result === 'loss' ? 'win' : 'draw';
  const userReport = buildPlayerReport(rng, estimatedRating, result, reachedEndgame, opening.skill, true);
  const opponentReport = buildPlayerReport(rng, input.opponentRating, opponentResult, reachedEndgame, 0, false);
  const [whiteBook, blackBook] = userColor === 'white' ? [userBookPly, opponentBookPly] : [opponentBookPly, userBookPly];

  const report = GameReportSchema.parse({
    engine: { name: 'stockfish', depth: 18, multiPv: 3 },
    book: bookReport(opening, whiteBook, blackBook),
    phases: { openingEndPly: 12, endgameStartPly: reachedEndgame ? 46 : null, openingSource: opening.name ? 'book' : 'heuristic' },
    players: userColor === 'white' ? { white: userReport, black: opponentReport } : { white: opponentReport, black: userReport },
    moves: openingMoves(rng, opening, userColor, estimatedRating, userBookPly)
  });
  return { report, userBookPly };
}
