import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CoursePlayer } from './CoursePlayer.js';

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
  test('plays the notes with audio, waits at the quiz, reveals the answer, then shows the takeaways', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(screen.getByRole('region', { name: 'Takeaways' }).textContent).toContain('Mind b2.');
  });
});
