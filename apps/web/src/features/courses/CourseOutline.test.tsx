import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourseBoardPanel } from './CourseBoardPanel.js';
import { CourseEpisodePanel } from './CourseEpisodePanel.js';
import { CourseOutline } from './CourseOutline.js';

const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 *');
const ids = tree.nodes.map((node) => node.id);
const bait: CourseEpisode = { id: 'e1', role: 'bait', focus: 'Take the pawn.', startNodeId: ids[0]!, endNodeId: ids[3]!, drillNodeIds: [], plies: [] };
const punish: CourseEpisode = {
  id: 'e2', role: 'punish', focus: 'The queen comes out.', startNodeId: ids[3]!, endNodeId: ids[3]!, drillNodeIds: [], plies: [],
  quiz: { answerNodeId: ids[3]!, prompt: 'Find it.', hint: '', reveal: '' }
};
const document: CourseDocument = {
  version: 1, kind: 'trap', title: 'T', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
  startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [{ id: 'c1', title: 'The trap', lineId: 'l1', episodeIds: ['e1', 'e2'] }],
  episodes: [bait, punish], takeaways: [], hookOptions: [], clipLinks: {}
};

describe('the Studio’s episode workspace (Phase 104)', () => {
  test('the episode list: numbered through the course, with its moves and a quiz mark', () => {
    const onSelect = vi.fn();
    render(<CourseOutline document={document} selectedEpisodeId="e2" onSelectEpisode={onSelect} />);
    const items = screen.getAllByRole('button');
    expect(items.map((item) => item.textContent)).toEqual(['1baitTake the pawn.1.d4 – 2…Nc6', '2punishQuizThe queen comes out.2…Nc6']);
    expect(items[1]).toHaveAttribute('aria-current', 'true');
    fireEvent.click(items[0]!);
    expect(onSelect).toHaveBeenCalledWith('e1');
  });

  test('the arrow keys step through the moves, but not while typing', () => {
    const onSelect = vi.fn();
    render(
      <>
        <input aria-label="A field" />
        <CourseBoardPanel document={document} nodeIds={ids} selectedNodeId={ids[1]!} onSelectNode={onSelect} arrows={[]} onDrawnArrows={vi.fn()} />
      </>
    );
    expect(screen.getByText('Move 2 of 4')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith(ids[2]);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith(ids[0]);
    onSelect.mockClear();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'A field' }), { key: 'ArrowRight' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('the arrow keys leave the moves alone while a dialog is open', () => {
    const onSelect = vi.fn();
    render(
      <>
        <div role="dialog" aria-modal="true" aria-label="Preview" />
        <CourseBoardPanel document={document} nodeIds={ids} selectedNodeId={ids[1]!} onSelectNode={onSelect} arrows={[]} onDrawnArrows={vi.fn()} />
      </>
    );
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('the editor’s head: where the episode stands, and the previous and next episode', () => {
    const onStep = vi.fn();
    render(<CourseEpisodePanel document={document} episode={bait} position={{ index: 0, count: 2 }} onStepEpisode={onStep} direction="" nodeIds={ids} selectedNodeId={ids[0]!} drawnArrows={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Episode 1 of 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous episode' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next episode' }));
    expect(onStep).toHaveBeenCalledWith(1);
  });
});
