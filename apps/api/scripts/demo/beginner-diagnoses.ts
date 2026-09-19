import type { DiagnosticProfileEntry } from '@freechesscoach/chess-analysis';
import type { DiagnosisCodeId, Direction, HistoryStatus, MistakeCategory, ScopeTag, Severity } from '@freechesscoach/shared';

/** What the coach has found about the six-weeks-in player. Every code is a real
 * catalog code, and each is a *mechanism* (why the mistake happens), never a
 * restated symptom like "didn't check for threats" — see docs/diagnose.md. */

interface EntrySpec {
  code: DiagnosisCodeId;
  direction: Direction;
  opportunities: number;
  episodes: number;
  confidence: DiagnosticProfileEntry['confidence'];
  spread: DiagnosticProfileEntry['spread'];
  severityMix: Record<Severity, number>;
  scopeTags: ScopeTag[];
  history: HistoryStatus;
  controlSkill?: DiagnosticProfileEntry['controlSkill'];
}

function entryFor(spec: EntrySpec): DiagnosticProfileEntry {
  const failureRate = spec.episodes / spec.opportunities;
  const posteriorMean = (spec.episodes + 1) / (spec.opportunities + 2);
  const halfWidth = 1.64 * Math.sqrt((posteriorMean * (1 - posteriorMean)) / (spec.opportunities + 3));
  return {
    code: spec.code,
    direction: spec.direction,
    opportunities: spec.opportunities,
    episodes: spec.episodes,
    failureRate: Number(failureRate.toFixed(3)),
    posteriorMean: Number(posteriorMean.toFixed(3)),
    credibleInterval: [Number(Math.max(0, posteriorMean - halfWidth).toFixed(3)), Number(Math.min(1, posteriorMean + halfWidth).toFixed(3))],
    confidence: spec.confidence,
    spread: spec.spread,
    totalHwdl: Number((spec.episodes * 0.11).toFixed(2)),
    severityMix: spec.severityMix,
    meanReachability: 0.72,
    scopeTags: spec.scopeTags,
    controlSkill: spec.controlSkill ?? null,
    historyStatus: spec.history
  };
}

const mix = (minor: number, meaningful: number, major: number, decisive: number): Record<Severity, number> => ({ minor, meaningful, major, decisive });

export const BEGINNER_PROFILE: DiagnosticProfileEntry[] = [
  entryFor({ code: 'BV-10', direction: 'B', opportunities: 46, episodes: 15, confidence: 'probable', spread: { games: 12, sessions: 5, openings: 4, sides: 2 }, severityMix: mix(2, 6, 5, 2), scopeTags: ['general'], history: 'persistent' }),
  entryFor({ code: 'TA-07', direction: 'D', opportunities: 19, episodes: 7, confidence: 'probable', spread: { games: 7, sessions: 4, openings: 3, sides: 2 }, severityMix: mix(0, 2, 4, 1), scopeTags: ['general'], history: 'persistent', controlSkill: { code: 'TA-07', direction: 'O', failureRate: 0.18 } }),
  entryFor({ code: 'BV-01', direction: 'D', opportunities: 60, episodes: 10, confidence: 'signal', spread: { games: 9, sessions: 4, openings: 4, sides: 2 }, severityMix: mix(3, 4, 3, 0), scopeTags: ['clock_bound'], history: 'improving' }),
  entryFor({ code: 'MS-07', direction: 'N', opportunities: 38, episodes: 9, confidence: 'signal', spread: { games: 8, sessions: 4, openings: 3, sides: 2 }, severityMix: mix(2, 4, 3, 0), scopeTags: ['general'], history: 'improving' }),
  entryFor({ code: 'MS-08', direction: 'N', opportunities: 40, episodes: 9, confidence: 'signal', spread: { games: 8, sessions: 3, openings: 4, sides: 2 }, severityMix: mix(3, 3, 3, 0), scopeTags: ['clock_bound'], history: 'newly_observed' }),
  entryFor({ code: 'BV-15', direction: 'B', opportunities: 52, episodes: 8, confidence: 'signal', spread: { games: 7, sessions: 3, openings: 3, sides: 2 }, severityMix: mix(2, 3, 3, 0), scopeTags: ['general'], history: 'improving' }),
  entryFor({ code: 'TA-04', direction: 'D', opportunities: 12, episodes: 3, confidence: 'insufficient', spread: { games: 3, sessions: 1, openings: 2, sides: 1 }, severityMix: mix(0, 1, 1, 1), scopeTags: ['side_color_bound'], history: 'newly_observed' })
];

export interface FocusAreaSpec {
  category: MistakeCategory;
  code: DiagnosisCodeId;
  status: 'active' | 'improving' | 'resolved';
  isPrimary: boolean;
  evidence: number;
  note: string;
}

/** The coach's notes are addressed to the player, about *why*, with one thing to do. */
export const BEGINNER_FOCUS_AREAS: FocusAreaSpec[] = [
  {
    category: 'hanging_piece',
    code: 'BV-10',
    status: 'active',
    isPrimary: true,
    evidence: 11,
    note: "After your opponent moves, you keep planning around the board as it was a move ago. In four of your last nine losses the piece that fell was attacked by the very move you were answering. Before you play anything, ask one question: what did their last move change? What does it attack now, and what did it stop defending?"
  },
  {
    category: 'missed_tactic',
    code: 'TA-07',
    status: 'active',
    isPrimary: false,
    evidence: 7,
    note: "Knight forks have cost you material three times this month. You look at where an enemy knight is standing; the fork lives where it can jump. For each knight on the board, name every square it can reach and what sits on those squares — you find your own forks fine, so this is just the same skill pointed the other way."
  },
  {
    category: 'calculation_error',
    code: 'MS-07',
    status: 'improving',
    isPrimary: false,
    evidence: 8,
    note: "You used to recapture instantly. Over the last two weeks you paused before recapturing in five of eight exchanges, and twice you found a stronger in-between move. The pause is the whole skill. Keep it, even when the recapture looks obvious."
  },
  {
    category: 'hanging_piece',
    code: 'BV-15',
    status: 'improving',
    isPrimary: false,
    evidence: 9,
    note: "You are now checking the square a piece lands on before you release it. Pieces moved onto attacked squares fell from once every three games to about once every seven."
  },
  {
    category: 'missed_tactic',
    code: 'TA-01',
    status: 'resolved',
    isPrimary: false,
    evidence: 6,
    note: "You have found every mate in one for three weeks running, including two with under a minute on the clock. This one is done."
  },
  {
    category: 'hanging_piece',
    code: 'BV-02',
    status: 'resolved',
    isPrimary: false,
    evidence: 5,
    note: "Free pieces used to slip past you. You have taken every free piece offered in your last twelve games."
  }
];
