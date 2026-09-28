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
  CoachBoard: ({ fen, arrows, onUserMove }: { fen: string; arrows: unknown[]; onUserMove: typeof board.play }) => {
    board.play = onUserMove;
    return <div data-testid="board" data-fen={fen} data-arrows={arrows.length} />;
  }
}));

const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 *');
const [d4, e5, dxe5, nc6] = tree.nodes;
const document: CourseDocument = {
  version: 1, kind: 'opening_course', title: 'Englund', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'general',
  startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], takeaways: [], hookOptions: [], clipLinks: {},
  episodes: [{ id: 'e1', role: 'line', focus: '', startNodeId: d4!.id, endNodeId: nc6!.id, beats: [], drillNodeIds: [e5!.id, nc6!.id], notes: [{ nodeId: e5!.id, text: 'The gambit.', arrows: [] }] }]
};

function handlers() {
  return { onStageDone: vi.fn(), onNextStage: vi.fn(), onExit: vi.fn() };
}

const findPrompt = () => screen.findByText(/to play/, undefined, { timeout: 2000 });
const arrowsShown = () => Number(screen.getByTestId('board').dataset.arrows);

describe('CourseDrill', () => {
  test('plays the other side, records the first try at each move, and sums up', async () => {
    const record = vi.fn(() => Promise.resolve());
    const progress: CourseProgressStore = { signedIn: true, lookup: vi.fn(() => Promise.resolve(new Map())), record };
    vi.mocked(judgeQuizMove).mockResolvedValue({ quality: 'mistake', bestLineSan: [] } as unknown as ClassifiedMoveDto);
    render(<CourseDrill document={document} stage="drill" progress={progress} courseSlug="englund-aaaaaaaaaaaa" {...handlers()} />);

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
    render(<CourseDrill document={{ ...document, episodes: [{ ...document.episodes[0]!, drillNodeIds: [e5!.id] }] }} stage="drill" {...handlers()} />);
    expect(await screen.findByText(/Black to play/, undefined, { timeout: 2000 })).toBeTruthy();
    await act(async () => board.play('d5', 'irrelevant', 'd7d5'));
    fireEvent.click(await screen.findByRole('button', { name: 'Play the course move' }));
    expect(await screen.findByText('1 of 1 right first time.', undefined, { timeout: 3000 })).toBeTruthy();
  });

  test('practice: arrows first, then fewer; known moves are played for you; nothing is recorded', async () => {
    const record = vi.fn(() => Promise.resolve());
    const progress: CourseProgressStore = { signedIn: true, lookup: vi.fn(() => Promise.resolve(new Map())), record };
    vi.mocked(judgeQuizMove).mockResolvedValue({ quality: 'mistake', bestLineSan: [] } as unknown as ClassifiedMoveDto);
    const props = handlers();
    render(<CourseDrill document={document} stage="practice" progress={progress} courseSlug="englund-aaaaaaaaaaaa" {...props} />);

    // Round 1: both moves with their arrow.
    await findPrompt();
    expect(arrowsShown()).toBe(1);
    act(() => board.play('e5', e5!.fenAfter, e5!.uci));
    await findPrompt();
    expect(arrowsShown()).toBe(1);
    act(() => board.play('Nc6', nc6!.fenAfter, nc6!.uci));
    expect(await screen.findByText('0 of 2 moves known.')).toBeTruthy();

    // Round 2: no arrows; e5 right (known), Nc6 missed (its arrow comes back).
    fireEvent.click(screen.getByRole('button', { name: 'Next round' }));
    await findPrompt();
    expect(arrowsShown()).toBe(0);
    act(() => board.play('e5', e5!.fenAfter, e5!.uci));
    await findPrompt();
    await act(async () => board.play('Nf6', 'irrelevant', 'g8f6'));
    fireEvent.click(await screen.findByRole('button', { name: 'Show the move' }));
    expect(await screen.findByText('1 of 2 moves known.')).toBeTruthy();

    // Round 3: e5 is played for you; Nc6 has its arrow again.
    fireEvent.click(screen.getByRole('button', { name: 'Next round' }));
    await findPrompt();
    expect(screen.getByTestId('board').dataset.fen).toBe(dxe5!.fenAfter);
    expect(arrowsShown()).toBe(1);
    act(() => board.play('Nc6', nc6!.fenAfter, nc6!.uci));
    fireEvent.click(await screen.findByRole('button', { name: 'Next round' }));
    await findPrompt();
    expect(arrowsShown()).toBe(0);
    act(() => board.play('Nc6', nc6!.fenAfter, nc6!.uci));

    expect(await screen.findByText('You know every move.')).toBeTruthy();
    expect(props.onStageDone).toHaveBeenCalledWith('practice');
    fireEvent.click(screen.getByRole('button', { name: 'Now without arrows' }));
    expect(props.onNextStage).toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  }, 20000);

  test('the full drill asks both sides, White first', async () => {
    render(<CourseDrill document={document} stage="full_drill" {...handlers()} />);
    expect(await screen.findByText(/White to play/)).toBeTruthy();
    expect(screen.getByTestId('board').dataset.fen).toBe(tree.startFen);
  });
});
