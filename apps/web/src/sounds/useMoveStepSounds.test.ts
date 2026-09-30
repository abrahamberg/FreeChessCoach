import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { playBoardSound } from './board-sounds.js';
import { useMoveStepSounds } from './useMoveStepSounds.js';

vi.mock('./board-sounds.js', () => ({ playBoardSound: vi.fn() }));
const played = vi.mocked(playBoardSound);

const rated = (ply: number, quality: ClassifiedMoveDto['quality'], evalAfterCp: number) => ({ ply, quality, evalAfterCp }) as ClassifiedMoveDto;

beforeEach(() => played.mockClear());

describe('useMoveStepSounds', () => {
  test('one step forward sounds that move; opening at a ply, stepping back and jumping do not', () => {
    const { rerender } = renderHook((props: { ply: number }) => useMoveStepSounds({ ply: props.ply, sanMoves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5'], learnerSide: 'white' }), {
      initialProps: { ply: 2 }
    });
    expect(played).not.toHaveBeenCalled();
    rerender({ ply: 3 });
    expect(played).toHaveBeenLastCalledWith('move');
    rerender({ ply: 4 });
    expect(played).toHaveBeenLastCalledWith('opponent');
    rerender({ ply: 3 });
    rerender({ ply: 5 });
    rerender({ ply: 0 });
    expect(played).toHaveBeenCalledTimes(2);
  });

  test('an analyzed game plays bad and great for either side; a live one never does', () => {
    const classifiedMoves = [rated(1, 'book', 20), rated(2, 'blunder', 400)];
    const analyzed = renderHook((props: { ply: number }) => useMoveStepSounds({ ply: props.ply, sanMoves: ['e4', 'f6'], learnerSide: 'white', classifiedMoves }), { initialProps: { ply: 1 } });
    analyzed.rerender({ ply: 2 });
    expect(played).toHaveBeenLastCalledWith('bad');

    const live = renderHook((props: { ply: number }) => useMoveStepSounds({ ply: props.ply, sanMoves: ['e4', 'f6'], learnerSide: 'white' }), { initialProps: { ply: 1 } });
    live.rerender({ ply: 2 });
    expect(played).toHaveBeenLastCalledWith('opponent');
  });

  test('the learner’s own drop sounds at once, not again when the move lands', () => {
    const { result, rerender } = renderHook((props: { ply: number; sanMoves: string[] }) => useMoveStepSounds({ ply: props.ply, sanMoves: props.sanMoves, learnerSide: 'white' }), {
      initialProps: { ply: 0, sanMoves: [] as string[] }
    });
    result.current.soundOwnMove('e4');
    expect(played).toHaveBeenCalledTimes(1);
    rerender({ ply: 1, sanMoves: ['e4'] });
    expect(played).toHaveBeenCalledTimes(1);
    rerender({ ply: 2, sanMoves: ['e4', 'e5'] });
    expect(played).toHaveBeenLastCalledWith('opponent');
  });

  test('practice: a position with Black to move, and the move and reply sounded in turn', () => {
    vi.useFakeTimers();
    const startFen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 2';
    const { rerender } = renderHook((props: { ply: number }) => useMoveStepSounds({ ply: props.ply, sanMoves: ['Nf6', 'Ng5'], learnerSide: 'black', startFen, maxStep: 2 }), {
      initialProps: { ply: 0 }
    });
    rerender({ ply: 2 });
    expect(played).toHaveBeenLastCalledWith('move');
    vi.advanceTimersByTime(300);
    expect(played).toHaveBeenLastCalledWith('opponent');
    vi.useRealTimers();
  });
});
