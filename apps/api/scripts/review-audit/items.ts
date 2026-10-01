import { renderBoardFact, reviewMoveTexts, type BoardFact, type CourseNodeFacts } from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto, EngineEval } from '@freechesscoach/shared';
import type { AnalysedGame } from './analyze.js';
import { play, playLine } from './oracle.js';
import { reviewSource } from './sources.js';
import { hashOf } from './store.js';
import type { AuditItem, AuditPosition, LineView } from './types.js';

export interface Extracted {
  positions: AuditPosition[];
  items: AuditItem[];
}

type Draft = Omit<AuditItem, 'key' | 'positionKey' | 'gameId' | 'split' | 'checks' | 'settled' | 'sampled'>;

/** Every sentence of both surfaces, with the position it is about. */
export function extractItems(analysed: AnalysedGame): Extracted {
  const positions = new Map<string, AuditPosition>();
  const items: AuditItem[] = [];
  const add = (position: AuditPosition, draft: Draft): void => {
    const known = positions.get(position.key);
    if (!known) positions.set(position.key, position);
    else if (!known.linesBefore.length) known.linesBefore = position.linesBefore;
    const key = hashOf([draft.surface, position.fenBefore, position.san, draft.text].join('|'));
    items.push({ ...draft, key, positionKey: position.key, gameId: position.gameId, split: position.split, checks: [], settled: false, sampled: false });
  };
  for (const move of analysed.reviewMoves) {
    const position = reviewPosition(analysed, move);
    if (position) for (const draft of reviewDrafts(move, position)) add(position, draft);
  }
  for (const { position, drafts } of dossierDrafts(analysed)) for (const draft of drafts) add(position, draft);
  return { positions: [...positions.values()], items };
}

function positionKeyOf(gameId: string, fenBefore: string, san: string): string {
  return hashOf(`${gameId}|${fenBefore}|${san}`).slice(0, 16);
}

export function lineViews(evaluation: EngineEval | undefined): LineView[] {
  return (evaluation?.lines ?? []).map((line) => ({ san: line.moveSan, cp: line.cp, mate: line.mateIn, pv: (line.pvSan ?? [line.moveSan]).slice(0, 12) }));
}

function basePosition(analysed: AnalysedGame, where: string, san: string, mover: 'white' | 'black', fenBefore: string, fenAfter: string, evals: Map<string, EngineEval>): AuditPosition {
  const { game } = analysed;
  const moveNumber = Number(fenBefore.split(' ')[5] ?? 1);
  const ply = (moveNumber - 1) * 2 + (mover === 'white' ? 1 : 2);
  return {
    key: positionKeyOf(game.id, fenBefore, san),
    gameId: game.id,
    split: game.split,
    band: game.band,
    where,
    moveLabel: `${moveNumber}${mover === 'white' ? '.' : '…'}${san}`,
    san,
    mover,
    readerSide: game.readerSide,
    quality: null,
    fenBefore,
    fenAfter,
    linesBefore: lineViews(evals.get(fenBefore)),
    linesAfter: lineViews(evals.get(fenAfter)),
    url: game.source === 'lichess' ? `https://lichess.org/${game.id}#${ply}` : null,
    focus: game.focusPly !== null && Math.abs(game.focusPly - ply) <= 1
  };
}

function reviewPosition(analysed: AnalysedGame, move: ClassifiedMoveDto): AuditPosition | null {
  if (!move.fenBefore || !move.fenAfter) return null;
  const position = basePosition(analysed, `p${move.ply}`, move.moveSan, move.mover, move.fenBefore, move.fenAfter, analysed.evalsByFen);
  return { ...position, quality: move.quality };
}

/** The positions a review sentence may speak about: the board before and
 * after, and one move further along whatever move it names. */
function reviewDrafts(move: ClassifiedMoveDto, position: AuditPosition): Draft[] {
  const { fenBefore, fenAfter } = position;
  const reply = move.tacticAllowed?.byMoveSan ?? position.linesAfter[0]?.san;
  const best = move.bestMoveSan;
  return reviewMoveTexts(move).map(({ kind, text }) => {
    const source = reviewSource(kind, text, move);
    const data = kind === 'allowed' ? move.tacticAllowed : kind === 'prevention' ? move.tacticPrevention : kind === 'opportunity' ? move.tacticOpportunity : null;
    const context = [fenBefore, fenAfter];
    if (kind === 'allowed' && reply) context.push(...compact([play(fenAfter, reply)]));
    if (kind === 'opportunity' && (move.tacticOpportunity?.embodiedBySan ?? best)) context.push(...compact([play(fenBefore, move.tacticOpportunity?.embodiedBySan ?? best ?? '')]));
    if (kind === 'reason' || kind === 'betterWas') context.push(...namedMoveFens(text, fenBefore, fenAfter));
    return { surface: 'review' as const, source, text, data: data ?? null, contextFens: unique(context) };
  });
}

/** A reason that names a move ("Missed Nxe5, …", "Qd1 keeps …", "where Qc1# followed", "better was Nc3 Nf6"): the positions along it. */
function namedMoveFens(text: string, fenBefore: string, fenAfter: string): string[] {
  const better = /better was (.+)$/.exec(text);
  if (better?.[1]) return playLine(fenBefore, better[1].split(' ')).fens.slice(1);
  const fens: string[] = [];
  for (const token of text.match(/\b(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|O-O(?:-O)?)(?:=[QRBN])?[+#]?/g) ?? []) {
    fens.push(...compact([play(fenBefore, token), play(fenAfter, token)]));
  }
  return fens;
}

interface NodeDrafts {
  position: AuditPosition;
  drafts: Draft[];
}

/** The dossier's rows, as the prompt shows them, for every node shown in full. */
function dossierDrafts(analysed: AnalysedGame): NodeDrafts[] {
  const { dossier, tree, dossierEvals } = analysed;
  const treeNodes = new Map(tree.nodes.map((node) => [node.id, node]));
  const rows = dossierRows(analysed.dossierText);
  const leafNodeIds = new Map(tree.lines.map((line) => [line.leafNodeId, line.id]));
  return dossier.nodes.flatMap((node) => {
    const treeNode = treeNodes.get(node.nodeId);
    const shown = rows.get(node.nodeId);
    if (!treeNode) return [];
    const fenBefore = treeNode.parentId ? (treeNodes.get(treeNode.parentId)?.fenAfter ?? tree.startFen) : tree.startFen;
    const position = basePosition(analysed, node.nodeId, node.san, node.side, fenBefore, treeNode.fenAfter, dossierEvals);
    const drafts = shown ? nodeDrafts(node, shown, position) : [];
    const lineId = leafNodeIds.get(node.nodeId);
    const line = lineId ? dossier.lines.find((each) => each.lineId === lineId) : undefined;
    for (const feature of line?.endFeatures ?? []) drafts.push({ surface: 'dossier', source: 'dossier:line-end', text: `end position: ${feature}`, data: null, contextFens: [position.fenAfter] });
    return drafts.length ? [{ position: { ...position, quality: node.quality }, drafts }] : [];
  });
}

/** Node id → its detail rows (`label: value`). */
function dossierRows(text: string): Map<string, Map<string, string[]>> {
  const rows = new Map<string, Map<string, string[]>>();
  let current: Map<string, string[]> | null = null;
  for (const row of text.split('\n')) {
    const head = /^(n\d+) /.exec(row);
    if (head?.[1]) {
      current = new Map();
      rows.set(head[1], current);
      const verdict = / \| before: (.+)$/.exec(row);
      if (verdict?.[1]) current.set('verdict', [`before: ${verdict[1]}`]);
      continue;
    }
    const detail = /^ {4}([^:]+): (.*)$/.exec(row);
    if (current && detail?.[1] && detail[2] !== undefined) current.set(detail[1], [...(current.get(detail[1]) ?? []), detail[2]]);
  }
  for (const [id, detail] of rows) if (!detail.size) rows.delete(id);
  return rows;
}

function nodeDrafts(node: CourseNodeFacts, rows: Map<string, string[]>, position: AuditPosition): Draft[] {
  const { fenBefore, fenAfter } = position;
  const drafts: Draft[] = [];
  const push = (source: string, text: string, data: unknown, contextFens: string[]): void => {
    drafts.push({ surface: 'dossier', source, text, data, contextFens: unique(contextFens) });
  };
  for (const text of rows.get('verdict') ?? []) push('dossier:verdict', text, { before: node.before, after: node.after, evalAfterCp: node.evalAfterCp }, [fenBefore, fenAfter]);
  for (const fact of node.board) push(`dossier:board:${fact.kind}`, renderBoardFact(fact), fact, [fenBefore, fenAfter, ...replyFens(fact, fenAfter)]);
  const best = node.bestInstead;
  if (best && rows.has('best instead')) {
    const bestFens = playLine(fenBefore, best.line).fens;
    push('dossier:best-instead', `best instead: ${rows.get('best instead')?.[0] ?? ''}`, best, [fenBefore, ...bestFens]);
    for (const fact of rows.has(`why ${best.san} is better`) ? best.board : []) push(`dossier:why-better:${fact.kind}`, `${best.san} ${renderBoardFact(fact)}`, fact, [fenBefore, ...bestFens.slice(0, 2)]);
  }
  for (const text of node.tactics) push('dossier:tactics', text, null, [fenBefore, fenAfter, ...compact([play(fenBefore, node.bestInstead?.san ?? ''), play(fenAfter, position.linesAfter[0]?.san ?? '')])]);
  for (const alternative of node.alternatives) push('dossier:alternative', `${alternative.san}: ${alternative.verdict}`, alternative, [fenBefore, ...compact([play(fenBefore, alternative.san)])]);
  for (const tempting of node.tempting) {
    const text = (rows.get(`tempting ${tempting.kind}`) ?? []).find((row) => row.startsWith(tempting.san)) ?? tempting.san;
    push(`dossier:tempting:${tempting.kind}`, `tempting ${tempting.kind}: ${text}`, tempting, [fenBefore, ...playLine(fenBefore, [tempting.san, ...tempting.refutation]).fens]);
  }
  return drafts;
}

function replyFens(fact: BoardFact, fenAfter: string): string[] {
  return fact.kind === 'stopsGuarding' ? compact([play(fenAfter, fact.replySan)]) : [];
}

function compact(fens: (string | null)[]): string[] {
  return fens.filter((fen): fen is string => fen !== null);
}

function unique(fens: string[]): string[] {
  return [...new Set(fens)];
}
