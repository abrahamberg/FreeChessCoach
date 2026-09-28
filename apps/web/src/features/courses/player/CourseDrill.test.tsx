import { courseDrillKey, parseCourseTree } from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto, CourseDocument } from '@freechesscoach/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourseDrill } from './CourseDrill.js';
import type { CourseProgressStore } from './course-progress.js';
import { judgeQuizMove } from './judge-quiz-move.js';

vi.mock('./judge-quiz-move.js', () => ({ judgeQuizMove: vi.fn() }));
// react-chessboard measures its squares, which jsdom can't; the test plays
// moves through the last onUserMove the board was given.
const board = vi.hoisted(() => ({ play: ((): void => undefined) as (san: string, fen: string, uci: string) => void }));
vi.mock('../../board/CoachBoard.js', () => ({
  CoachBoard: ({ fen, onUserMove }: { fen: string; onUserMove: typeof board.play }) => {
    board.play = onUserMove;
    return <div data-testid="board" data-fen={fen} />;
  }
}));

const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 *');
const [d4, e5, dxe5, nc6] = tree.nodes;
const document: CourseDocument = {
  version: 1, kind: 'opening_course', title: 'Englund', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'general',
  startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], takeaways: [], hookOptions: [], clipLinks: {},
  episodes: [{ id: 'e1', role: 'line', focus: '', startNodeId: d4!.id, endNodeId: nc6!.id, beats: [], drillNodeIds: [e5!.id, nc6!.id], notes: [{ nodeId: e5!.id, text: 'The gambit.', arrows: [] }] }]
};

describe('CourseDrill', () => {
  test('plays the other side, records the first try at each move, and sums up', async () => {
    const record = vi.fn(() => Promise.resolve());
    const progress: CourseProgressStore = { signedIn: true, lookup: vi.fn(() => Promise.resolve(new Map())), record };
    vi.mocked(judgeQuizMove).mockResolvedValue({ quality: 'mistake', bestLineSan: [] } as unknown as ClassifiedMoveDto);
    render(<CourseDrill document={document} progress={progress} courseSlug="englund-aaaaaaaaaaaa" onExit={() => undefined} />);

    // 1.d4 is played for the learner, then Black is asked.
    expect(await screen.findByText(/Black to play/, undefined, { timeout: 2000 })).toBeTruthy();
    expect(screen.getByTestId('board').dataset.fen).toBe(d4!.fenAfter);
    act(() => board.play('e5', e5!.fenAfter, e5!.uci));
    expect(screen.getByText('e5. The gambit.')).toBeTruthy();
    expect(record).toHaveBeenCalledWith([{ key: courseDrillKey(d4!.fenAfter, e5!.uci), san: 'e5', courseSlug: 'englund-aaaaaaaaaaaa', correct: true }]);

    // 2.dxe5 is played; a weaker move than Nc6 is a miss, and counts once.
    expect(await screen.findByText(/Black to play/, undefined, { timeout: 2000 })).toBeTruthy();
    await act(async () => board.play('Nf6', 'irrelevant', 'g8f6'));
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => board.play('Nf6', 'irrelevant', 'g8f6'));
    fireEvent.click(await screen.findByRole('button', { name: 'Show the move' }));
    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenLastCalledWith([{ key: courseDrillKey(dxe5!.fenAfter, nc6!.uci), san: 'Nc6', courseSlug: 'englund-aaaaaaaaaaaa', correct: false }]);

    expect(screen.getByText('1 of 2 right first time.')).toBeTruthy();
    expect(screen.getByText('To go over again tomorrow: Nc6.')).toBeTruthy();
  });

  test('a move about as good as the course move is accepted without penalty; the preview saves nothing', async () => {
    vi.mocked(judgeQuizMove).mockResolvedValue({ quality: 'excellent' } as ClassifiedMoveDto);
    render(<CourseDrill document={{ ...document, episodes: [{ ...document.episodes[0]!, drillNodeIds: [e5!.id] }] }} onExit={() => undefined} />);
    expect(await screen.findByText(/Black to play/, undefined, { timeout: 2000 })).toBeTruthy();
    await act(async () => board.play('d5', 'irrelevant', 'd7d5'));
    fireEvent.click(await screen.findByRole('button', { name: 'Play the course move' }));
    expect(await screen.findByText('1 of 1 right first time.', undefined, { timeout: 3000 })).toBeTruthy();
  });
});
