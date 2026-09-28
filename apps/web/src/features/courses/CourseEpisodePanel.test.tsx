import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourseEpisodePanel } from './CourseEpisodePanel.js';

const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 *');
const [d4, e5] = tree.nodes;
const episode: CourseEpisode = { id: 'e1', role: 'bait', focus: 'Take the pawn.', startNodeId: d4!.id, endNodeId: tree.nodes[3]!.id, beats: [], notes: [], drillNodeIds: [] };
const document: CourseDocument = {
  version: 1, kind: 'trap', title: 'T', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
  startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], episodes: [episode], takeaways: [], hookOptions: [], clipLinks: {}
};

describe('CourseEpisodePanel', () => {
  test('tabs instead of one long form: Notes, Quiz, Clip, and AI when the AI wrote it', () => {
    const onChange = vi.fn();
    render(
      <CourseEpisodePanel document={document} episode={episode} direction="" nodeIds={tree.nodes.map((node) => node.id)} selectedNodeId={e5!.id} drawnArrows={[]} onChange={onChange} aiWriter={<p>The AI writer</p>} />
    );
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Notes', 'Quiz', 'Clip', 'AI']);
    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Note on 1…e5' })).toBeTruthy();
    expect(screen.queryByText('The AI writer')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Quiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quiz on this move' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ quiz: expect.objectContaining({ answerNodeId: e5!.id }) }));
    expect(screen.queryByRole('heading', { name: /Note on/ })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'AI' }));
    expect(screen.getByText('The AI writer')).toBeTruthy();
  });
});
