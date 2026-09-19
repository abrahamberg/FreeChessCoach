import { TACTIC_MOTIF_TYPES, type StatsBucket, type SumCount, type TacticMotifCounts } from '@freechesscoach/shared';

function addSumCount(a: SumCount, b: SumCount): SumCount {
  return { sum: a.sum + b.sum, count: a.count + b.count };
}

/** Union of both records' keys — `a`'s first, then `b`'s new ones — with
 * `mergeRow` combining any key present in both. */
function mergeRecords<Key extends string, Row>(
  a: Partial<Record<Key, Row>>,
  b: Partial<Record<Key, Row>>,
  mergeRow: (x: Row, y: Row) => Row
): Partial<Record<Key, Row>> {
  const merged: Partial<Record<Key, Row>> = { ...a };
  for (const key of Object.keys(b) as Key[]) {
    const left = merged[key];
    const right = b[key] as Row;
    merged[key] = left === undefined ? right : mergeRow(left, right);
  }
  return merged;
}

/** Absent + absent stays absent (never 0): only a game that reported the
 * field can make the total exist. */
function addOptional(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
}

function mergeTactics(a: TacticMotifCounts, b: TacticMotifCounts): TacticMotifCounts {
  const merged = {} as Record<string, TacticMotifCounts[keyof TacticMotifCounts]>;
  for (const type of TACTIC_MOTIF_TYPES) {
    const preventable = addOptional(a[type].preventable, b[type].preventable);
    const prevented = addOptional(a[type].prevented, b[type].prevented);
    merged[type] = {
      opportunities: a[type].opportunities + b[type].opportunities,
      found: a[type].found + b[type].found,
      ...(preventable !== undefined && { preventable }),
      ...(prevented !== undefined && { prevented })
    };
  }
  return merged as TacticMotifCounts;
}

/** Adds two buckets — the "merge" step. Associative and commutative, with
 * `emptyStatsBucket()` as identity, so any grouping of games gives one result. */
export function mergeStatsBuckets(a: StatsBucket, b: StatsBucket): StatsBucket {
  return {
    games: a.games + b.games,
    opening: {
      bookMoves: addSumCount(a.opening.bookMoves, b.opening.bookMoves),
      accuracy: addSumCount(a.opening.accuracy, b.opening.accuracy),
      mistakes: addSumCount(a.opening.mistakes, b.opening.mistakes),
      byOpening: mergeRecords(a.opening.byOpening, b.opening.byOpening, (x, y) => ({
        games: x.games + y.games,
        points: x.points + y.points,
        accuracySum: x.accuracySum + y.accuracySum
      })) as StatsBucket['opening']['byOpening']
    },
    tactics: mergeTactics(a.tactics, b.tactics),
    strategy: {
      overall: addSumCount(a.strategy.overall, b.strategy.overall),
      pawnStructure: addSumCount(a.strategy.pawnStructure, b.strategy.pawnStructure),
      spaceAdvantage: addSumCount(a.strategy.spaceAdvantage, b.strategy.spaceAdvantage),
      activePiece: addSumCount(a.strategy.activePiece, b.strategy.activePiece),
      attacking: addSumCount(a.strategy.attacking, b.strategy.attacking),
      defending: addSumCount(a.strategy.defending, b.strategy.defending)
    },
    endgame: {
      accuracy: addSumCount(a.endgame.accuracy, b.endgame.accuracy),
      byStanding: mergeRecords(a.endgame.byStanding, b.endgame.byStanding, (x, y) => ({
        games: x.games + y.games,
        wins: x.wins + y.wins,
        losses: x.losses + y.losses,
        draws: x.draws + y.draws
      })),
      byTheme: mergeRecords(a.endgame.byTheme, b.endgame.byTheme, (x, y) => ({
        games: x.games + y.games,
        accuracy: addSumCount(x.accuracy, y.accuracy)
      }))
    },
    rating: addSumCount(a.rating, b.rating)
  };
}
