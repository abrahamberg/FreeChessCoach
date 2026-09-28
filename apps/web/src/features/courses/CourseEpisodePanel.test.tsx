import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourseEpisodePanel } from './CourseEpisodePanel.js';

const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 *');
const [d4, e5] = tree.nodes;
const episode: CourseEpisode = {
  id: 'e1', role: 'bait', focus: 'Take the pawn.', startNodeId: d4!.id, endNodeId: tree.nodes[3]!.id, drillNodeIds: [], budget: { course: 2, video: 1 },
  plies: [{ nodeId: e5!.id, text: 'Black offers a pawn. The Englund Gambit.', arrows: [], course: true, video: true }]
};
const document: CourseDocument = {
  version: 1, kind: 'trap', title: 'T', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
  startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], episodes: [episode], takeaways: [], hookOptions: [], clipLinks: {}
};
const nodeIds = tree.nodes.map((node) => node.id);

function renderPanel(selectedNodeId: string, onChange = vi.fn()) {
  render(<CourseEpisodePanel document={document} episode={episode} direction="" nodeIds={nodeIds} selectedNodeId={selectedNodeId} drawnArrows={[]} onChange={onChange} aiWriter={<p>The AI writer</p>} />);
  return onChange;
}

describe('CourseEpisodePanel', () => {
  test('tabs: Moves, Quiz, Video, and AI when the AI wrote it; the budget shows what speaks', () => {
    renderPanel(e5!.id);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Moves', 'Quiz', 'Video', 'AI']);
    expect(screen.getByText(/1 of 2 speak in the course/)).toBeTruthy();
    expect(screen.getByText(/1 of 1 in the video/)).toBeTruthy();
    expect(screen.queryByText('The AI writer')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'AI' }));
    expect(screen.getByText('The AI writer')).toBeTruthy();
  });

  test('a move: ticks for the course and the video, one text, and a different video line when wanted', () => {
    const onChange = renderPanel(e5!.id);
    expect(screen.getByRole('button', { name: 'In the course' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'In the video' })).toHaveAttribute('aria-pressed', 'true');
    // The caption the video shows unless one is set.
    expect(screen.getByRole('textbox', { name: 'Caption' })).toHaveAttribute('placeholder', 'Black offers a pawn.');

    fireEvent.click(screen.getByRole('button', { name: 'In the video' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ plies: [expect.objectContaining({ video: false })] }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'A different line for the video' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ plies: [expect.objectContaining({ say: 'Black offers a pawn. The Englund Gambit.' })] }));
  });

  test('a move with no entry yet: writing makes it speak in the course', () => {
    const onChange = renderPanel(d4!.id);
    expect(screen.getByRole('button', { name: 'In the course' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.change(screen.getByRole('textbox', { name: 'What the coach says' }), { target: { value: 'White takes the centre.' } });
    expect(onChange.mock.lastCall?.[0].plies[0]).toEqual({ nodeId: d4!.id, text: 'White takes the centre.', arrows: [], course: true, video: false });
  });

  test('the Video tab is this episode’s part of the video, with its length', () => {
    renderPanel(e5!.id);
    fireEvent.click(screen.getByRole('tab', { name: 'Video' }));
    expect(screen.getByRole('region', { name: "The video's script" }).textContent).toContain('1…e5');
    expect(screen.getByText(/About \d+ s of the video/)).toBeTruthy();
  });

  test('a quiz on the selected move', () => {
    const onChange = renderPanel(e5!.id);
    fireEvent.click(screen.getByRole('tab', { name: 'Quiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quiz on this move' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ quiz: expect.objectContaining({ answerNodeId: e5!.id }) }));
  });
});
