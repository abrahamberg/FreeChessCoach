import { Chess } from 'chess.js';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { ms14LoosePieceScanOmission } from './ms-14-loose-piece-scan.js';
import { detectorContext } from './test-context.js';

/** After Kh1, the c3 rook (attacked twice, defended once) is loose. */
const LOOSE_ROOK_FEN = '4k3/8/8/3nn3/1b4b1/2R1P3/PP4P1/6K1 w - - 0 1';
/** Nothing of White's is attacked. */
const NOTHING_LOOSE_FEN = '4k3/8/8/8/8/8/8/3QK3 w - - 0 1';

const LOSS: Partial<ClassifiedMoveDto> = { quality: 'mistake', cpBefore: 0, cpAfter: -300 };
const NO_LOSS: Partial<ClassifiedMoveDto> = { quality: 'mistake', cpBefore: 0, cpAfter: -10 };

function fenAfter(fenBefore: string, moveSan: string): string {
  const chess = new Chess(fenBefore);
  chess.move(moveSan);
  return chess.fen();
}

/** The opponent's actual reply, played from this move's `fenAfter`. */
function reply(fenBefore: string, moveSan: string): ClassifiedMoveDto {
  return {
    ply: 2,
    moveSan,
    mover: 'black',
    isUserMove: false,
    cpLoss: 0,
    quality: 'best',
    bestLineSan: [moveSan],
    bestLinePvSan: [moveSan],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore
  };
}

function contextFor(fenBefore: string, moveSan: string, overrides: Partial<ClassifiedMoveDto>, replySan?: string) {
  const nextMoves = replySan ? [reply(fenAfter(fenBefore, moveSan), replySan)] : undefined;
  return detectorContext(fenBefore, moveSan, overrides, { nextMoves });
}

describe('ms14LoosePieceScanOmission', () => {
  test('fails when the loose piece is captured within two plies and the eval confirms the loss', () => {
    const observation = ms14LoosePieceScanOmission.detect(contextFor(LOOSE_ROOK_FEN, 'Kh1', LOSS, 'Nxc3'));

    expect(observation).toMatchObject({ code: 'MS-14', direction: 'N', failed: true });
    expect(observation!.detail).toContain('loose piece on c3, captured within two plies');
  });

  test('an even trade on the loose square is not a failure', () => {
    const observation = ms14LoosePieceScanOmission.detect(contextFor(LOOSE_ROOK_FEN, 'Kh1', NO_LOSS, 'Nxc3'));

    expect(observation).toMatchObject({ failed: false, hwdl: 0 });
    expect(observation!.detail).toContain('without losing anything');
  });

  test('not failed when the loose piece is never captured, even on a loss', () => {
    const observation = ms14LoosePieceScanOmission.detect(contextFor(LOOSE_ROOK_FEN, 'Kh1', LOSS, 'Kd7'));

    expect(observation).toMatchObject({ failed: false });
    expect(observation!.detail).toContain('not punished within two plies');
  });

  test('no opportunity when the mover has no loose pieces', () => {
    expect(ms14LoosePieceScanOmission.detect(contextFor(NOTHING_LOOSE_FEN, 'Qd4', LOSS, 'Kd7'))).toBeNull();
  });

  test('no opportunity without the following plies (unknown future)', () => {
    expect(ms14LoosePieceScanOmission.detect(contextFor(LOOSE_ROOK_FEN, 'Kh1', LOSS))).toBeNull();
  });
});
