import { hasComeBack, habitResults, type DossierGame, type DossierObservation, type DiagnosticProfileEntry } from '@freechesscoach/chess-analysis';
import type { ProgressDossierInput, DossierArea, DossierGraduated, DossierMeasure, DossierNewGame } from '@freechesscoach/prompts';
import { CATEGORY_LABELS, DIAGNOSIS_CODES_BY_ID } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as diagnosticObservationsRepo from '../db/repositories/diagnostic-observations.js';
import * as diagnosticProfilesRepo from '../db/repositories/diagnostic-profiles.js';
import * as focusAreasRepo from '../db/repositories/focus-areas.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import * as studentMemoryRepo from '../db/repositories/student-memory.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { NotFoundError } from '../lib/errors.js';

const RECENT_GAMES = 5;
const GAMES_READ = 10;
const RECENT_LESSONS = 5;

/**
 * Everything a progress round needs about the student, read for the session
 * in progress: each habit with what the last games show, the improved list
 * (flagging a habit that failed again after graduating), the coach's own
 * memory and lesson notes, and the games analysed since the previous session.
 */
export async function loadProgressDossier(db: Kysely<Database>, userId: string, sessionId: string): Promise<ProgressDossierInput> {
  const [user, areas, gameRefs, previousEnd, memory, lessons, profile] = await Promise.all([
    usersRepo.findById(db, userId),
    focusAreasRepo.listAllByUser(db, userId),
    gamesRepo.listRecentAnalysed(db, userId, GAMES_READ),
    sessionsRepo.latestEndedAtForUser(db, userId, sessionId),
    studentMemoryRepo.findByUserId(db, userId),
    sessionsRepo.listRecentLessonNotes(db, userId, RECENT_LESSONS),
    diagnosticProfilesRepo.latestProfileAnyTimeControl(db, userId)
  ]);
  if (!user) throw new NotFoundError('User not found');

  const games: DossierGame[] = gameRefs.map((game) => ({
    gameId: game.id,
    playedAt: game.playedAt ?? game.createdAt,
    isNew: previousEnd !== null && game.createdAt > previousEnd
  }));
  const observationRows = await diagnosticObservationsRepo.listForGames(db, games.map((game) => game.gameId));
  const observations: DossierObservation[] = observationRows.map((row) => ({ gameId: row.gameId, code: row.code, failed: row.failed }));

  const working = areas.filter((area) => area.status !== 'graduated');
  return {
    studentName: user.displayName,
    selfAssessment: user.selfAssessment,
    areas: working.map((area) => toArea(area, games, observations, profile?.profile ?? [])),
    graduated: areas.filter((area) => area.status === 'graduated').map((area) => toGraduated(area, games, observations)),
    memory: memory?.content ?? null,
    lessons: lessons.map((lesson) => ({ endedAt: lesson.endedAt, note: lesson.lessonNote })),
    newGames: games
      .filter((game) => game.isNew)
      .map((game) => toNewGame(game, gameRefs, working, observations))
  };
}

function labelOf(area: focusAreasRepo.FocusAreaRow): string {
  return (area.diagnosisCode && DIAGNOSIS_CODES_BY_ID.get(area.diagnosisCode)?.label) || CATEGORY_LABELS[area.category];
}

function toArea(
  area: focusAreasRepo.FocusAreaRow,
  games: DossierGame[],
  observations: DossierObservation[],
  profile: readonly DiagnosticProfileEntry[]
): DossierArea {
  return {
    label: labelOf(area),
    status: area.status === 'improving' ? 'improving' : 'active',
    isPrimary: area.isPrimary,
    note: area.note,
    measure: area.diagnosisCode ? measureOf(area.diagnosisCode, profile) : null,
    results: area.diagnosisCode ? habitResults(area.diagnosisCode, games, observations, RECENT_GAMES) : []
  };
}

/** The entry with the most chances: a code can have one per direction and time control. */
function measureOf(code: string, profile: readonly DiagnosticProfileEntry[]): DossierMeasure | null {
  const entries = profile.filter((entry) => entry.code === code);
  const best = entries.reduce<DiagnosticProfileEntry | null>((top, entry) => (top && top.opportunities >= entry.opportunities ? top : entry), null);
  return best && { episodes: best.episodes, opportunities: best.opportunities, failureRate: best.failureRate, confidence: best.confidence };
}

function toGraduated(area: focusAreasRepo.FocusAreaRow, games: DossierGame[], observations: DossierObservation[]): DossierGraduated {
  const graduatedAt = area.graduatedAt ?? area.lastSeenAt;
  return {
    label: labelOf(area),
    graduatedAt,
    cameBack: area.diagnosisCode ? hasComeBack(area.diagnosisCode, graduatedAt, games, observations) : false
  };
}

function toNewGame(
  game: DossierGame,
  refs: gamesRepo.AnalysedGameRef[],
  working: focusAreasRepo.FocusAreaRow[],
  observations: DossierObservation[]
): DossierNewGame {
  const ref = refs.find((candidate) => candidate.id === game.gameId);
  const habits = working.flatMap((area) => {
    const here = area.diagnosisCode ? observations.filter((row) => row.gameId === game.gameId && row.code === area.diagnosisCode) : [];
    return here.length === 0 ? [] : [{ label: labelOf(area), opportunities: here.length, failures: here.filter((row) => row.failed).length }];
  });
  return { label: ref ? describeGame(ref) : 'a game', habits };
}

function describeGame(game: gamesRepo.AnalysedGameRef): string {
  const opponent = game.userColor === 'white' ? game.blackName : game.whiteName;
  const outcome = userOutcome(game);
  return ['vs ' + (opponent ?? 'an opponent'), outcome, game.timeControl].filter(Boolean).join(', ');
}

function userOutcome(game: gamesRepo.AnalysedGameRef): string | null {
  if (game.result === '1/2-1/2') return 'drawn';
  if (game.result !== '1-0' && game.result !== '0-1') return null;
  const won = game.result === (game.userColor === 'white' ? '1-0' : '0-1');
  return won ? 'won' : 'lost';
}
