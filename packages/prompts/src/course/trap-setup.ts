import { courseNodeAncestry, spokenPiece, type CourseSkeleton } from '@freechesscoach/chess-analysis';
import { nodeLabel, type CoursePromptContext } from './context.js';

type TrapSkeleton = Extract<CourseSkeleton, { kind: 'trap' }>;

interface PathMove {
  nodeId: string;
  mover: 'white' | 'black';
  piece: string;
  from: string;
  to: string;
}

/** The main line's moves with the squares they leave and reach, from the
 * dossier's own "moved" fact (castling has none, and lands no blow). */
function pathMoves(context: CoursePromptContext): PathMove[] {
  const leafId = context.lines[0]?.leafNodeId;
  if (!leafId) return [];
  const facts = new Map(context.dossier.nodes.map((node) => [node.nodeId, node]));
  return courseNodeAncestry(new Map(context.nodes.map((node) => [node.id, node])), leafId).flatMap((node) => {
    const fact = facts.get(node.id);
    const moved = fact?.board.find((each) => each.kind === 'moved');
    if (!fact || moved?.kind !== 'moved') return [];
    return [{ nodeId: node.id, mover: fact.side, piece: spokenPiece(moved.piece, moved.to), from: moved.from, to: moved.to }];
  });
}

/** Where the trap leaves the opening it grows from: the Stafford's 3…Nc6,
 * with the book's usual moves there. The first Stafford run never said the
 * known move was to take on e4 back. */
function departure(context: CoursePromptContext, setup: readonly PathMove[]): string {
  const facts = new Map(context.dossier.nodes.map((node) => [node.nodeId, node]));
  const family = (name: string): string => name.split(':')[0] ?? name;
  for (const move of setup) {
    const node = facts.get(move.nodeId);
    if (!node?.openingName || move.mover !== context.learnerSide) continue;
    const usual = node.bookSiblings.filter((each) => family(each.name) === family(node.openingName ?? '') && each.name !== node.openingName);
    if (!usual.length) continue;
    return `\n   Where it leaves the known road: ${nodeLabel(context, move.nodeId)} (${node.openingName}). The book's other moves there: ${usual.map((each) => `${each.san} (${each.name})`).join('; ')}.\n   Say it that way: the opening it grows from, the one move players usually make there (name no other opening), and the move the learner plays instead.\n   On the opponent's next move, say the tell to the learner, who is "you": "if they take the knight, you are in the gambit" (never "they are in").`;
  }
  return '';
}

/** Each piece that lands a blow from the answer on, with the setup move that
 * put it there or opened its line: the Stafford's 4…dxc6 opens the bishop
 * that mates on g4, and the first run called it "the deal". */
function blows(context: CoursePromptContext, skeleton: TrapSkeleton, moves: readonly PathMove[], setup: readonly PathMove[]): string {
  const facts = new Map(context.dossier.nodes.map((node) => [node.nodeId, node]));
  const from = moves.findIndex((move) => move.nodeId === skeleton.answerNodeId);
  if (from < 0) return '';
  const own = setup.filter((move) => move.mover === context.learnerSide);
  const rows = moves.slice(from).filter((move) => move.mover === context.learnerSide).flatMap((blow) => {
    const placed = own.findLast((move) => move.to === blow.from);
    const opened = own.find((move) => facts.get(move.nodeId)?.opens.some((each) => each.square === blow.from));
    const behind = [placed && `put there by ${nodeLabel(context, placed.nodeId)}`, opened && `its line opened by ${nodeLabel(context, opened.nodeId)}`].filter(Boolean);
    return behind.length ? [`${nodeLabel(context, blow.nodeId)} is the ${blow.piece}, ${behind.join(' and ')}`] : [];
  });
  if (!rows.length) return '';
  return `\n   The pieces that land the blows, and the setup move behind each: ${rows.join('; ')}.\n   Those setup moves are the ones that speak: say what the piece is there for,\n   in a few words, so the punishment is no surprise ("take back with the pawn:\n   it opens your light-squared bishop, and we need him later").`;
}

/** What the setup episode must say, from the opening book and the line. */
export function trapSetupFacts(context: CoursePromptContext, skeleton: TrapSkeleton | null): string {
  if (!skeleton) return '';
  const moves = pathMoves(context);
  const bait = moves.findIndex((move) => move.nodeId === skeleton.baitNodeId);
  const setup = bait < 0 ? [] : moves.slice(0, bait);
  return `${departure(context, setup)}${blows(context, skeleton, moves, setup)}`;
}
