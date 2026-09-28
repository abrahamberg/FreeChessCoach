import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CoursePlayer } from './CoursePlayer.js';
import type { CourseProgressStore } from './course-progress.js';

vi.mock('./judge-quiz-move.js', () => ({ judgeQuizMove: vi.fn() }));
// react-chessboard measures its squares, which jsdom can't.
vi.mock('../../board/CoachBoard.js', () => ({ CoachBoard: ({ fen }: { fen: string }) => <div data-fen={fen} /> }));

const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 *');
const [, n2, , n4] = tree.nodes.map((node) => node.id);
const episode: CourseEpisode = {
  id: 'e1', role: 'quiz', focus: '', startNodeId: n2!, endNodeId: n4!, drillNodeIds: [],
  plies: [{ nodeId: n2!, text: 'The Englund Gambit.', arrows: [], course: true, video: false }],
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
    // The coaching pane's round voice toggle, and the note's own replay button.
    expect(screen.getByRole('button', { name: 'Hear it again' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn the coach’s voice off' }));
    expect(screen.getByRole('button', { name: 'Turn the coach’s voice on' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Hear it again' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('How does Black win the pawn back?')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    expect(screen.getByText('Hint: Attack e5.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show the answer' }));
    expect(screen.getByText(/The answer is Nc6\. Nc6 hits the pawn on e5\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next: Practice' }));
    // The takeaways on their own screen, the board hidden until Back.
    expect(screen.getByRole('region', { name: 'Remember' }).textContent).toContain('Mind b2.');
    expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the moves' }));
    expect(screen.queryByRole('region', { name: 'Remember' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next: Practice' }));
    fireEvent.click(screen.getByRole('button', { name: /Continue to Practice/ }));
    // At phone width the stages are the header's picker.
    const stage = screen.getByRole('combobox', { name: 'Stage' }) as HTMLSelectElement;
    expect(stage.value).toBe('practice');
    expect(screen.getByRole('option', { name: '1. Play through ✓' })).toBeTruthy();
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
    expect(await screen.findByText('The Englund Gambit.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Course options' }));
    expect(screen.getByRole('menuitem', { name: 'Start over' })).toBeTruthy();

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
    const stage = screen.getByRole('combobox', { name: 'Stage' }) as HTMLSelectElement;
    await waitFor(() => expect(stage.value).toBe('drill'));
    expect(screen.getByRole('option', { name: '2. Practice ✓' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Course options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Start over' }));
    // It asks first: the place is lost.
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Start over' }));
    expect(stage.value).toBe('play_through');
    expect(screen.queryByRole('option', { name: /✓/ })).toBeNull();
  });

  test('a note’s tempting moves fold under it; the video and the reel each have a link', () => {
    const tempting = [{ san: 'Nc3', why: 'Develops, but the pawn on e5 stays lost.', refutation: ['Nc6'] }];
    const withTempting: CourseDocument = {
      ...document,
      episodes: [{ ...episode, plies: [{ ...episode.plies[0]!, tempting }] }],
      clipLinks: { youtube: 'https://www.youtube.com/watch?v=abcdefghijk', tiktok: 'https://www.tiktok.com/@coach/video/1' }
    };
    render(<CoursePlayer document={withTempting} noteAudio={() => Promise.resolve(null)} />);
    expect(screen.getByRole('button', { name: 'Watch the video' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Watch the reel' })).toHaveAttribute('href', 'https://www.tiktok.com/@coach/video/1');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const folded = screen.getByText('Tempting: Nc3?').closest('details')!;
    expect(folded.open).toBe(false);
    expect(folded.textContent).toContain('Nc3? Nc6 Develops, but the pawn on e5 stays lost.');
  });
});
