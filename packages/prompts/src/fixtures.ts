import type { CandidateMoment, ClassifiedMove } from '@freechesscoach/chess-analysis';
import type { CoachingPlan } from '@freechesscoach/shared';
import type { CoachPromptInput } from './coach-system.js';
import type { PlannerPromptInput } from './analysis-planner.js';
import type { SummarizerPromptInput } from './progress-summarizer.js';
import type { ProfilerPromptInput } from './onboarding-profiler.js';
import type { PuzzleCoachPromptInput } from './puzzle-coach-system.js';

/**
 * Shared fixtures for this package's own tests and scripts/generate-doc.ts.
 * One copy, not one per consumer — a snapshot test and the generated
 * docs/prompts.md reading different fixtures would defeat the point of
 * generating the doc from the same code the tests exercise. Not exported
 * from index.ts — internal to this package, not part of its public API.
 */
export const now = new Date('2026-07-28T12:00:00Z');

export const basePlan: CoachingPlan = {
  gameSummary: 'summary',
  openingNote: 'opening',
  themes: ['king_safety'],
  connectionToHistory: 'Second game in a row with a delayed castle.',
  moments: [
    {
      ply: 23,
      kind: 'user_mistake' as const,
      category: 'king_safety' as const,
      whatHappened: 'Pushed g4 in front of the uncastled king.',
      socraticQuestion: 'Before pushing this pawn, where is your king going to live?',
      keyLine: 'O-O Re8 d3 h6',
      revealDepthPlies: 6
    }
  ]
};

export function baseCoachInput(overrides: Partial<CoachPromptInput> = {}): CoachPromptInput {
  return {
    user: { displayName: 'Ann', selfAssessment: 'I blunder pieces', sessionCount: 3 },
    band: 'club',
    rating: 1500,
    persona: 'general',
    mode: 'analyze',
    game: {
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '1-0',
      timeControl: '10+0',
      userColor: 'white'
    },
    plan: basePlan,
    focusAreas: [],
    recentFindings: [],
    now,
    ...overrides
  };
}

const plannerMoves: ClassifiedMove[] = [
  {
    ply: 1,
    moveSan: 'e4',
    mover: 'white',
    isUserMove: true,
    cpLoss: 0,
    quality: 'good',
    bestLineSan: ['e4', 'e5'],
    evalAfterCp: 20,
    hangsPiece: false
  },
  {
    ply: 2,
    moveSan: 'e5',
    mover: 'black',
    isUserMove: false,
    cpLoss: 0,
    quality: 'good',
    bestLineSan: ['e5'],
    evalAfterCp: 15,
    hangsPiece: false
  },
  {
    ply: 3,
    moveSan: 'h3',
    mover: 'white',
    isUserMove: true,
    cpLoss: 180,
    quality: 'mistake',
    bestLineSan: ['d4', 'exd4'],
    evalAfterCp: -160,
    hangsPiece: false,
    reasons: ['Leaves the knight on d5 undefended']
  }
];

const plannerCandidateMoments: CandidateMoment[] = [{ ply: 3, kind: 'user_mistake', cpLoss: 180 }];

export function basePlannerInput(overrides: Partial<PlannerPromptInput> = {}): PlannerPromptInput {
  return {
    band: 'club',
    rating: 1500,
    focusAreas: [],
    recentFindings: [],
    selfAssessment: 'I blunder pieces',
    userColor: 'white',
    moves: plannerMoves,
    candidateMoments: plannerCandidateMoments,
    now,
    ...overrides
  };
}

export function baseSummarizerInput(overrides: Partial<SummarizerPromptInput> = {}): SummarizerPromptInput {
  return {
    band: 'club',
    rating: 1500,
    focusAreas: [],
    recentFindings: [],
    selfAssessment: 'I blunder pieces',
    plan: basePlan,
    transcript: 'coach: hello\nstudent: hi',
    recordedFindings: '(none recorded live)',
    now,
    ...overrides
  };
}

export function baseOnboardingInput(overrides: Partial<ProfilerPromptInput> = {}): ProfilerPromptInput {
  return {
    band: 'improving',
    linkedAccounts: ['lichess: annchess'],
    rawSelfAssessment: 'i always hang my queen lol',
    ...overrides
  };
}

export const investigatePositionFixture = {
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
  question: 'Does Nc3 hang the e4 pawn?'
};

export function basePuzzleCoachInput(overrides: Partial<PuzzleCoachPromptInput> = {}): PuzzleCoachPromptInput {
  return {
    reason: 'You missed several knight forks in your last few games.',
    totalCount: 5,
    currentItem: {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
      index: 2
    },
    ...overrides
  };
}
