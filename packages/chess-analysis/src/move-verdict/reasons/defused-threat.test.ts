import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { ClassifiedMoveDto, EngineEval, MoveQuality } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { flipActiveColorFen } from '../../null-move-fen.js';
import { parsePgn } from '../../pgn.js';
import { previousMoveOf } from '../../previous-move-of.js';
import { scanRealisticThreats } from '../../realistic-threats.js';
import { tacticPreventionReason } from '../../tactic-reason-text.js';
import { decideMoveVerdict, type MoveVerdictInput } from '../index.js';
import { OWNER_SEED_LINES, OWNER_SEED_PGN } from '../owner-seed-fixture.js';
import { BACK_RANK_FEN, line, scenario } from '../verdict-test-fixtures.js';

const PIECE_LETTERS: Record<string, PieceSymbol> = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' };
const NAMED_PIECE = /\b(king|queen|rook|bishop|knight|pawn) on ([a-h][1-8])\b/g;

/** The boards a prevention sentence may speak about: before the move, after
 * it, and after the one threat move it names, played by the opponent from
 * the position before the move. An illegal threat move throws. */
function boardsTheReaderSees(move: ClassifiedMoveDto, threatSan: string | undefined): string[] {
  const boards = [move.fenBefore ?? '', move.fenAfter ?? ''];
  if (!threatSan) return boards;
  const threat = new Chess(flipActiveColorFen(move.fenBefore ?? '') ?? '');
  threat.move(threatSan);
  return [...boards, threat.fen()];
}

/** Every "rook on d1" in `text` that stands on none of `boards`. */
function piecesNotOnAnyBoard(text: string, boards: readonly string[]): string[] {
  return [...text.matchAll(NAMED_PIECE)]
    .filter(([, name, square]) => !boards.some((fen) => new Chess(fen).get(square as Square)?.type === PIECE_LETTERS[name ?? '']))
    .map(([mention]) => mention);
}

function preventionCardOf(input: MoveVerdictInput) {
  const card = decideMoveVerdict(input)?.card.tacticPrevention ?? null;
  const text = card ? tacticPreventionReason({ ...card, isUserMove: true }) : '';
  return { card, text, boards: boardsTheReaderSees(input.move, card?.threatSan) };
}

// The owner's game, built once: every position, with the stored lines where
// the fixture has them.
const positions = parsePgn(OWNER_SEED_PGN).positions;
const evals: EngineEval[] = positions.map((position, index) => ({
  ply: index,
  fen: position.fen,
  depth: 12,
  lines: (OWNER_SEED_LINES[index] ?? []).map(([pv, score]) => line(position.fen, pv.split(' '), score))
}));
const moves: ClassifiedMoveDto[] = positions.slice(1).map((position, index) => ({
  ply: position.ply,
  moveSan: position.moveSan ?? '',
  uci: position.moveUci ?? '',
  mover: position.mover ?? 'white',
  quality: 'good',
  fenBefore: positions[index]?.fen,
  fenAfter: position.fen,
  isUserMove: position.mover === 'white',
  cpLoss: 0,
  bestLineSan: [],
  evalAfterCp: 0,
  hangsPiece: false,
  isTacticalPosition: true
}));

/** The move at `ply` as the worker hands it to the verdict: its own evals,
 * and the opponent's threats before their previous move and after this one
 * (`apps/api/src/services/tactic-prevention.ts`). */
function ownerSeedInput(ply: number, quality: MoveQuality): MoveVerdictInput {
  const move = { ...moves[ply - 1]!, quality };
  return {
    move,
    evals,
    previous: previousMoveOf(moves, ply),
    preventionScans: () => ({
      before: scanRealisticThreats(positions[ply - 2]!.fen, evals[ply - 2]!.lines),
      after: scanRealisticThreats(positions[ply]!.fen, evals[ply]!.lines)
    })
  };
}

describe('checkDefusedThreat', () => {
  // docs/plan.md F1: "rook on d1 checks the king on g1" with the rook on d8,
  // "rook on d5 forks …" with the rook on d8, "unveils the rook on d1 against
  // the queen on d6" with neither piece on the board.
  test.each([
    [23, '12.Bxc5', 'great'],
    [29, '15.Nxe5', 'great'],
    [49, '25.Qxc7', 'excellent']
  ] as const)("the owner's game, ply %i (%s): a prevention card names only pieces the reader can see", (ply, _label, quality) => {
    const { text, boards } = preventionCardOf(ownerSeedInput(ply, quality));

    expect(piecesNotOnAnyBoard(text, boards)).toEqual([]);
  });

  test('12.Bxc5: …Rxd1+ is met by Rxd1, so there was no back-rank mate to stop and no card', () => {
    expect(preventionCardOf(ownerSeedInput(23, 'great')).card).toBeNull();
  });

  test('a threat that stands on the board before the move: the card names the move that carries it', () => {
    const defended = scenario({
      fen: BACK_RANK_FEN,
      moveSan: 'h3',
      quality: 'best',
      before: [[['h3', 'Re2', 'Qd8+'], 300], [['Qd5', 'Re1#'], { mate: -1 }]],
      after: [[['Kf8'], 300]]
    });
    const blackToMove = BACK_RANK_FEN.replace(' w ', ' b ');
    const { card, text, boards } = preventionCardOf({
      ...defended,
      preventionScans: () => ({
        before: scanRealisticThreats(blackToMove, [line(blackToMove, ['Re1#'], { mate: -1 })]),
        after: scanRealisticThreats(defended.move.fenAfter ?? '', defended.evals[1]?.lines ?? [])
      })
    });

    expect(card).toMatchObject({ type: 'weakBackRank', prevented: true, threatSan: 'Re1#', gain: { kind: 'mate' } });
    expect(text).toContain('Re1#');
    expect(piecesNotOnAnyBoard(text, boards)).toEqual([]);
  });
});
