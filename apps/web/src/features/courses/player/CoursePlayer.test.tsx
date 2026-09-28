import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CoursePlayer } from './CoursePlayer.js';
import type { CourseProgressStore } from './course-progress.js';

vi.mock('./judge-quiz-move.js', () => ({ judgeQuizMove: vi.fn() }));
// react-chessboard measures its squares, which jsdom can't.
vi.mock('../../board/CoachBoard.js', () => ({ CoachBoard: ({ fen }: { fen: string }) => <div data-fen={fen} /> }));

const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 *');
const [, n2, , n4] = tree.nodes.map((node) => node.id);
const episode: CourseEpisode = {
  id: 'e1', role: 'quiz', focus: '', startNodeId: n2!, endNodeId: n4!, beats: [], drillNodeIds: [],
  notes: [{ nodeId: n2!, text: 'The Englund Gambit.', arrows: [] }],
  quiz: { answerNodeId: n4!, prompt: 'How does Black win the pawn back?', hint: 'Attack e5.', reveal: 'Nc6 hits the pawn on e5.' }
};
const document: CourseDocument = {
  version: 1, kind: 'trap', title: 'Englund', promise: 'Win the pawn back.', learnerSide: 'black', levelBand: 'improving', coachPersona: 'general',
  startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], episodes: [episode],
  takeaways: ['Watch e5.', 'Develop.', 'Mind b2.'], hookOptions: [], clipLinks: {}
};

describe('CoursePlayer', () => {
  test('plays the notes with audio, waits at the quiz, reveals the answer, shows the takeaways, then moves on to Practice', () => {
    const noteAudio = vi.fn(() => Promise.resolve(null));
    render(<CoursePlayer document={document} noteAudio={noteAudio} />);
    expect(screen.getByRole('heading', { name: 'Englund' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('The Englund Gambit.')).toBeTruthy();
    expect(noteAudio).toHaveBeenCalledWith('e1', n2);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('How does Black win the pawn back?')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    expect(screen.getByText('Hint: Attack e5.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show the answer' }));
    expect(screen.getByText(/The answer is Nc6\. Nc6 hits the pawn on e5\./)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Takeaways' }).textContent).toContain('Mind b2.');
    fireEvent.click(screen.getByRole('button', { name: 'Next: Practice' }));
    expect(screen.getByRole('button', { name: /Play through, done/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Practice' }).getAttribute('aria-current')).toBe('step');
  });

  test('a returning learner opens where they left off, and moving on saves the place', async () => {
    const saveEnrollment = vi.fn(() => Promise.resolve());
    const progress: CourseProgressStore = {
      signedIn: false,
      lookup: vi.fn(() => Promise.resolve(new Map())),
      record: vi.fn(() => Promise.resolve()),
      loadEnrollment: vi.fn(() => Promise.resolve({ stage: 'play_through' as const, place: { episode: 0, step: 1, practice: {} }, stagesDone: [] })),
      saveEnrollment
    };
    const { unmount } = render(<CoursePlayer document={document} noteAudio={() => Promise.resolve(null)} progress={progress} courseSlug="englund-aaaaaaaaaaaa" />);
    expect(await screen.findByText(/Welcome back: you were on Play through, episode 1, move 1/)).toBeTruthy();
    expect(screen.getByText('The Englund Gambit.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    unmount();
    await waitFor(() => expect(saveEnrollment).toHaveBeenCalledWith('englund-aaaaaaaaaaaa', { stage: 'play_through', place: { episode: 0, step: 2, practice: {} }, stagesDone: [] }));
  });

  test('a saved stage opens on its own; Start over goes back to the beginning', async () => {
    const progress: CourseProgressStore = {
      signedIn: false,
      lookup: vi.fn(() => Promise.resolve(new Map())),
      record: vi.fn(() => Promise.resolve()),
      loadEnrollment: vi.fn(() => Promise.resolve({ stage: 'drill' as const, place: { episode: 0, step: 0, practice: {} }, stagesDone: ['play_through' as const, 'practice' as const] })),
      saveEnrollment: vi.fn(() => Promise.resolve())
    };
    render(<CoursePlayer document={document} noteAudio={() => Promise.resolve(null)} progress={progress} courseSlug="englund-aaaaaaaaaaaa" />);
    expect(await screen.findByText(/Welcome back: you were on Drill/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Drill' }).getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('button', { name: /Practice, done/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByRole('button', { name: /Play through/ }).getAttribute('aria-current')).toBe('step');
    expect(screen.queryByRole('button', { name: /Practice, done/ })).toBeNull();
  });
});
