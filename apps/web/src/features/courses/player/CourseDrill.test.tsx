import { courseDrillKey, parseCourseTree } from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto, CourseDocument } from '@freechesscoach/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/** The learner's move to find is up (the highlighted row of the move log). */
const findPrompt = () =>
  waitFor(
    () => {
      const row = window.document.querySelector('.move-log__row--current');
      expect(row).not.toBeNull();
      return row;
    },
    { timeout: 2000 }
  );
const arrowsShown = () => Number(screen.getByTestId('board').dataset.arrows);

describe('CourseDrill', () => {
  test('plays the other side, records the first try at each move, and sums up', async () => {
    const record = vi.fn(() => Promise.resolve());
    const progress: CourseProgressStore = { signedIn: true, lookup: vi.fn(() => Promise.resolve(new Map())), record, loadEnrollment: vi.fn(() => Promise.resolve(null)), saveEnrollment: vi.fn(() => Promise.resolve()) };
    vi.mocked(judgeQuizMove).mockResolvedValue({ quality: 'mistake', bestLineSan: [] } as unknown as ClassifiedMoveDto);
    render(<CourseDrill document={document} stage="drill" progress={progress} courseSlug="englund-aaaaaaaaaaaa" {...handlers()} />);

    // 1.d4 is played for the learner, then Black is asked.
    expect(await findPrompt()).toBeTruthy();
    expect(screen.getByTestId('board').dataset.fen).toBe(d4!.fenAfter);
    act(() => board.play('e5', e5!.fenAfter, e5!.uci));
    await findPrompt();
    expect(screen.getByRole('list', { name: 'Last moves' }).textContent).toContain('1…e5 ✓The gambit.');
    expect(record).toHaveBeenCalledWith([{ key: courseDrillKey(d4!.fenAfter, e5!.uci), san: 'e5', courseSlug: 'englund-aaaaaaaaaaaa', correct: true }]);

    // 2.dxe5 is played; a weaker move than Nc6 is a miss, and counts once.
    expect(await findPrompt()).toBeTruthy();
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
    expect(await findPrompt()).toBeTruthy();
    await act(async () => board.play('d5', 'irrelevant', 'd7d5'));
    fireEvent.click(await screen.findByRole('button', { name: 'Play the course move' }));
    expect(await screen.findByText('1 of 1 right first time.', undefined, { timeout: 3000 })).toBeTruthy();
  });

  test('practice: arrows first, then fewer; known moves are played for you; nothing is recorded', async () => {
    const record = vi.fn(() => Promise.resolve());
    const progress: CourseProgressStore = { signedIn: true, lookup: vi.fn(() => Promise.resolve(new Map())), record, loadEnrollment: vi.fn(() => Promise.resolve(null)), saveEnrollment: vi.fn(() => Promise.resolve()) };
    vi.mocked(judgeQuizMove).mockResolvedValue({ quality: 'mistake', bestLineSan: [] } as unknown as ClassifiedMoveDto);
    const props = handlers();
    render(<CourseDrill document={document} stage="practice" progress={progress} courseSlug="englund-aaaaaaaaaaaa" {...props} />);

    const log = () => screen.getByRole('list', { name: 'Last moves' }).textContent ?? '';
    const play = async (san: string, fenAfter: string, uci: string) => {
      await findPrompt();
      await act(async () => board.play(san, fenAfter, uci));
    };
    const miss = async () => {
      await findPrompt();
      await act(async () => board.play('Nf6', 'irrelevant', 'g8f6'));
      fireEvent.click(await screen.findByRole('button', { name: 'Show the move' }));
    };
    const nextRound = () => fireEvent.click(screen.getByRole('button', { name: 'Next round' }));

    // Round 1: every move with its arrow, and named in the log.
    await findPrompt();
    expect(arrowsShown()).toBe(1);
    expect(log()).toContain('1…e5');
    // Practice says what the move does, not "your move".
    expect(log()).toContain('The gambit.');
    expect(log()).not.toContain('your move');
    // The arrow shows the move, so no "Show the move" yet.
    expect(screen.queryByRole('button', { name: 'Show the move' })).toBeNull();
    await play('e5', e5!.fenAfter, e5!.uci);
    await findPrompt();
    expect(arrowsShown()).toBe(1);
    // The log, newest on top: yours to play, the opponent's reply, your last move.
    expect(log()).toMatch(/You 2…Nc6.*Opponent 2\.dxe5.*You 1…e5/);
    await play('Nc6', nc6!.fenAfter, nc6!.uci);
    expect(await screen.findByText('Round 1 of 3 done.')).toBeTruthy();
    expect(screen.getByText('Next round: arrows on 1 of 2 moves.')).toBeTruthy();

    // Round 2: fewer arrows. e5 keeps its arrow, Nc6 has none and is hidden in the log.
    nextRound();
    await findPrompt();
    expect(arrowsShown()).toBe(1);
    await play('e5', e5!.fenAfter, e5!.uci);
    await findPrompt();
    expect(arrowsShown()).toBe(0);
    expect(log()).not.toContain('Nc6');
    expect(screen.getByRole('button', { name: 'Show the move' })).toBeTruthy();
    expect(screen.getByText(/Round 2 of 3 ·/)).toBeTruthy();
    await miss();
    // The miss adds rounds.
    expect(await screen.findByText('Round 2 of 5 done.')).toBeTruthy();
    expect(screen.getByText(/Missed: Nc6\. The arrow comes back for it\./)).toBeTruthy();

    // Round 3: e5 without its arrow; the missed Nc6 has its arrow back.
    nextRound();
    await findPrompt();
    expect(arrowsShown()).toBe(0);
    await play('e5', e5!.fenAfter, e5!.uci);
    await findPrompt();
    expect(arrowsShown()).toBe(1);
    await play('Nc6', nc6!.fenAfter, nc6!.uci);
    expect(await screen.findByText('Round 3 of 5 done.')).toBeTruthy();
    expect(screen.getByText('Next round: arrows on every move.')).toBeTruthy();

    // Rounds 4 and 5: e5 is known and played for you; Nc6 fades out.
    nextRound();
    await findPrompt();
    expect(screen.getByTestId('board').dataset.fen).toBe(dxe5!.fenAfter);
    await play('Nc6', nc6!.fenAfter, nc6!.uci);
    nextRound();
    await findPrompt();
    expect(arrowsShown()).toBe(0);
    await play('Nc6', nc6!.fenAfter, nc6!.uci);

    expect(await screen.findByText('You know every move.')).toBeTruthy();
    expect(props.onStageDone).toHaveBeenCalledWith('practice');
    fireEvent.click(screen.getByRole('button', { name: 'Next: Drill' }));
    expect(props.onNextStage).toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  }, 20000);

  test('the full drill asks both sides, White first, with the move hidden', async () => {
    render(<CourseDrill document={document} stage="full_drill" {...handlers()} />);
    expect(await findPrompt()).toBeTruthy();
    expect(screen.getByTestId('board').dataset.fen).toBe(tree.startFen);
    expect(screen.getByRole('img', { name: 'White' })).toBeTruthy();
    expect(screen.getByLabelText('Your move, hidden')).toBeTruthy();
  });

  test('practice keeps one move log across episodes, and no line counter', async () => {
    const split: CourseDocument = {
      ...document,
      episodes: [
        { id: 'e1', role: 'line', focus: '', startNodeId: d4!.id, endNodeId: e5!.id, beats: [], drillNodeIds: [e5!.id], notes: [] },
        { id: 'e2', role: 'line', focus: '', startNodeId: dxe5!.id, endNodeId: nc6!.id, beats: [], drillNodeIds: [nc6!.id], notes: [] }
      ]
    };
    render(<CourseDrill document={split} stage="practice" {...handlers()} />);
    await findPrompt();
    act(() => board.play('e5', e5!.fenAfter, e5!.uci));
    // Episode 2 begins with 2.dxe5 played for you; the log still has 1…e5.
    await waitFor(() => expect(screen.getByRole('list', { name: 'Last moves' }).textContent).toMatch(/You 2…Nc6.*Opponent 2\.dxe5.*You 1…e5/), { timeout: 2000 });
    expect(screen.queryByText(/Line \d of/)).toBeNull();
  });
});
