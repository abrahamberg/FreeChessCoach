import type { Color } from 'chess.js';
import { result } from './check-result.js';
import { colorOf, other } from './oracle.js';
import type { AuditItem, AuditPosition, CheckResult, LineView, SearchView } from './types.js';

/** One forced mate a sentence speaks of: in how many moves (`null`: it gives
 * no number), for whom, on which board, and along which move (`null`: the
 * board's best line). */
export interface MateClaim {
  said: number | null;
  side: Color;
  at: 'before' | 'after';
  san: string | null;
}

/** The audit's own copy of the owner's rule (2026-10-02), not the app's
 * `CONFIG.mateCount`: a count is owed for a mate of at most seven moves that
 * the search covers, which is five plies from the searched board at the
 * depths the app analyses at (measured: exact 100% of the time up to five
 * plies at depth 12 and 18, 72% at six) and any length at depth 34 or more. */
const OWED = { maxMoves: 7, provenPlies: 5, deepDepth: 34 };

const NUMBER = '(?: in (\\d+))?';
const NAMED = new RegExp(`\\bforc(?:e|ing) mate${NUMBER}\\b.*? with ([^\\s.,]+)`);
const PLAYED = new RegExp(`\\bforced mate${NUMBER}\\b`);
const VERDICT = new RegExp(`(White|Black) has a forced mate${NUMBER}`);
const MISSED = /^Missed (?:mate in (\d+)|a forced mate) starting with (\S+)$/;

const count = (digits: string | undefined): number | null => (digits === undefined ? null : Number(digits));

/** The forced mates a sentence speaks of, read off its template. The
 * audit's own bookkeeping, at the edge (as `sources.ts`): the dossier's rows
 * carry only English, and the review's card says the same words. A
 * checkmate on the board has nothing to count. */
export function mateClaims(source: string, text: string, mover: 'white' | 'black'): MateClaim[] {
  const own = colorOf(mover);
  if (source === 'review:reason:missed-mate') {
    const missed = MISSED.exec(text);
    return missed ? [{ said: count(missed[1]), side: own, at: 'before', san: missed[2] ?? null }] : [];
  }
  if (source === 'dossier:verdict') return verdictClaims(text);
  if (source === 'dossier:alternative') {
    const [san, words] = text.split(': ');
    const verdict = VERDICT.exec(words ?? '');
    return san && verdict ? [{ said: count(verdict[2]), side: verdict[1] === 'White' ? 'w' : 'b', at: 'before', san }] : [];
  }
  if (source.startsWith('review:tactic-opportunity') || source.startsWith('review:tactic-allowed') || source === 'dossier:tactics') return cardClaims(text, own);
  return [];
}

/** A tactic card: "forced mate in 5" is the board after the move that was
 * played; "force mate in 6 with Qxh3" is the named move's own line, before
 * the move when it was missed and after it when it was allowed. */
function cardClaims(text: string, own: Color): MateClaim[] {
  const played = PLAYED.exec(text);
  if (played) return [{ said: count(played[1]), side: own, at: 'after', san: null }];
  const named = NAMED.exec(text);
  if (!named) return [];
  const allowed = /\blet (them|you) forc/.test(text);
  return [{ said: count(named[1]), side: allowed ? other(own) : own, at: allowed ? 'after' : 'before', san: named[2] ?? null }];
}

/** "before: … → after: …": each half is the best line of its own board. */
function verdictClaims(text: string): MateClaim[] {
  const [before, after] = text.replace(/^before: /, '').split(' → after: ');
  return ([['before', before], ['after', after]] as const).flatMap(([at, words]) => {
    const verdict = VERDICT.exec(words ?? '');
    return verdict ? [{ said: count(verdict[2]), side: verdict[1] === 'White' ? ('w' as const) : ('b' as const), at, san: null }] : [];
  });
}

/** Whether a sentence about this line owes its mate count: the line mates
 * for `side`, in few enough moves, and the search covers it. `toMove` is
 * the side to move on the searched board: mating in N it needs 2N - 1
 * plies, being mated in N it needs 2N. */
export function mateCountOwed(mate: number | null, side: Color, toMove: Color, depth: number): boolean {
  if (mate === null || mate === 0 || mate > 0 !== (side === 'w')) return false;
  const moves = Math.abs(mate);
  const plies = 2 * moves - (side === toMove ? 1 : 0);
  return moves <= OWED.maxMoves && (plies <= OWED.provenPlies || depth >= OWED.deepDepth);
}

/**
 * Whether a deeper search leaves a mate count standing. A mate the engine
 * has found is a proof that the mate takes at most that many moves, so only
 * a faster mate on the same line shows the sentence's count too long; a
 * slower one, or none, shows that the deeper search found less than the
 * sentence's own did. The other side mating on that line contradicts it.
 */
export function mateCountExact(said: number, side: Color, deeper: { mate: number | null } | undefined): boolean {
  if (!deeper || deeper.mate === null) return true;
  if (deeper.mate > 0 !== (side === 'w')) return false;
  return Math.abs(deeper.mate) >= said;
}

/** The search a claim's count was read off: the dossier's own for a dossier
 * row (it searches the position again, three lines), else the review's. */
function searchOf(item: AuditItem, position: AuditPosition, at: 'before' | 'after'): SearchView | undefined {
  const own = item.surface === 'dossier' ? position.dossier : position.review;
  return own?.[at];
}

function claimLine(lines: readonly LineView[], claim: MateClaim): LineView | undefined {
  return claim.san === null ? lines[0] : lines.find((each) => each.san === claim.san);
}

/** `mate-count` (the owner's rule, 2026-10-02): a forced mate is said with
 * its number of moves exactly when the mate is short and the search covers
 * it; a longer one, or one the search does not cover, is said without. */
export function mateCountCheck(item: AuditItem, position: AuditPosition): CheckResult[] {
  const wrong: string[] = [];
  let compared = 0;
  for (const claim of mateClaims(item.source, item.text, position.mover)) {
    const search = searchOf(item, position, claim.at);
    const line = search ? claimLine(search.lines, claim) : undefined;
    if (!search || !line || line.mate === null) continue;
    compared += 1;
    const mover = colorOf(position.mover);
    const owed = mateCountOwed(line.mate, claim.side, claim.at === 'before' ? mover : other(mover), search.depth);
    const moves = Math.abs(line.mate);
    if (owed && claim.said === null) wrong.push(`a mate in ${moves} the depth-${search.depth} search covers, said with no number`);
    if (!owed && claim.said !== null) wrong.push(`says mate in ${claim.said}; the line is mate in ${moves} at depth ${search.depth}, too long for a number or not covered`);
  }
  return compared ? [result('mate-count', wrong.length === 0, wrong.join('; '))] : [];
}

/** `mate-count-exact`: every mate count of the sentence against the audit's
 * own deeper search of that board (`mate-probe.ts`). No probe (a position
 * run before the probe existed), or a move the probe does not list: no
 * result. */
export function mateCountExactCheck(item: AuditItem, position: AuditPosition): CheckResult[] {
  const probe = position.mateProbe;
  if (!probe) return [];
  const compared = mateClaims(item.source, item.text, position.mover).flatMap((claim) => {
    const line = claimLine(claim.at === 'before' ? probe.before : probe.after, claim);
    return line && claim.said !== null ? [{ claim, said: claim.said, line }] : [];
  });
  if (!compared.length) return [];
  const wrong = compared.filter(({ claim, said, line }) => !mateCountExact(said, claim.side, line));
  return [result('mate-count-exact', wrong.length === 0, wrong.map(({ claim, said, line }) => `says mate in ${said} ${where(claim)}; the deeper search has ${mateWords(line)} there`).join('; '))];
}

function where(claim: MateClaim): string {
  return `${claim.at === 'before' ? 'before the move' : 'after the move'}${claim.san ? ` with ${claim.san}` : ''}`;
}

function mateWords(line: LineView): string {
  return line.mate === null ? 'no mate' : `mate in ${Math.abs(line.mate)} for ${line.mate > 0 ? 'White' : 'Black'}`;
}
