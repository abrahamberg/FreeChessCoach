import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseGeneration } from '@freechesscoach/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourseProducts } from './CourseProducts.js';

const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 *');
const [d4, e5, dxe5, nc6] = tree.nodes;
const base: CourseDocument = {
  version: 1, kind: 'trap', title: 'T', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
  startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], episodes: [], takeaways: [], hookOptions: [], clipLinks: {}
};
const reel: NonNullable<CourseDocument['reel']> = {
  style: 'highlight', startNodeId: d4!.id, climaxNodeId: dxe5!.id, endNodeId: nc6!.id,
  hook: 'White takes the bait.', topText: 'Would you take it?', beats: [{ nodeId: e5!.id, say: 'A pawn for free.', caption: 'Free pawn?' }], payoff: 'It was a trap.', cta: 'Full lesson on the channel.', loop: 'Would you take it?'
};

function renderProducts(document: CourseDocument, { dirty = false, generation = null as CourseGeneration | null } = {}) {
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CourseProducts courseId="c1" document={document} generation={generation} dirty={dirty} onChange={onChange} />
    </QueryClientProvider>
  );
  return onChange;
}

describe('CourseProducts (§13)', () => {
  test('only the videos the course makes', () => {
    renderProducts({ ...base, videos: { video: false, reel: true } });
    expect(screen.queryByRole('region', { name: 'YouTube video' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Reel' })).toBeTruthy();
  });

  test('the video: its packaging is edited by hand; an unplanned video says how to plan it', () => {
    const onChange = renderProducts({ ...base, videos: { video: true, reel: false } });
    expect(screen.getByText(/The video is not planned yet/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'How greed gets mated' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ video: { title: 'How greed gets mated', thumbnailText: '', hook: '', outro: '' } }));
  });

  test('the reel: its span, texts and beats; the AI writes it once the draft is saved', () => {
    const onChange = renderProducts({ ...base, videos: { video: false, reel: true }, reel });
    expect(screen.getByText('2.dxe5')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: '1…e5 caption' }), { target: { value: 'Free?' } });
    expect(onChange.mock.lastCall?.[0].reel.beats).toEqual([{ nodeId: e5!.id, say: 'A pawn for free.', caption: 'Free?' }]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Style' }), { target: { value: 'puzzle' } });
    expect(onChange.mock.lastCall?.[0].reel.style).toBe('puzzle');
    expect(screen.getByRole('button', { name: 'Write the reel again with AI' })).toBeEnabled();
  });

  test('no reel yet: one button writes it; unsaved edits wait', () => {
    renderProducts({ ...base, videos: { video: false, reel: true } }, { dirty: true });
    expect(screen.getByRole('button', { name: 'Write the reel with AI' })).toBeDisabled();
  });
});
