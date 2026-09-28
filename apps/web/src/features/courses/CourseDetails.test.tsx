import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument } from '@freechesscoach/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourseDetails } from './CourseDetails.js';
import { StartOverDialog } from './StartOverDialog.js';

const tree = parseCourseTree('1. e4 e5 *');
const document: CourseDocument = {
  version: 1, kind: 'trap', title: 't', promise: 'After this you win.', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
  startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], episodes: [], takeaways: [], hookOptions: [], clipLinks: {}, level: { rating: 1200, order: 1 }
};

describe('CourseDetails', () => {
  test('shows the coach and the level; a new rating sets the band', () => {
    const onChange = vi.fn();
    render(<CourseDetails document={document} onChange={onChange} />);
    expect(screen.getByText('The Commander')).toBeTruthy();
    expect(screen.getByText('1200-01')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Rating' }), { target: { value: '1600' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ level: { rating: 1600, order: 1 }, levelBand: 'club' }));
  });

  test('what the AI makes: both unless set; choosing the clip saves it', () => {
    const onChange = vi.fn();
    render(<CourseDetails document={document} onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'The AI makes' });
    expect(within(group).getByRole('button', { name: 'Course and clip' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(group).getByRole('button', { name: 'Clip' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ versions: { long: false, short: true } }));
  });

  test('changing the coach says the words need rewriting for the new voice', () => {
    const onChange = vi.fn();
    render(<CourseDetails document={document} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('radio', { name: 'The Scholar' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ coachPersona: 'scholar' }));
    expect(screen.getByText(/start over and write it again with AI/)).toBeTruthy();
  });
});

describe('StartOverDialog', () => {
  test('one reset, two ways', () => {
    const onWithAi = vi.fn();
    const onTemplate = vi.fn();
    render(<StartOverDialog dirty onWithAi={onWithAi} onTemplate={onTemplate} onClose={vi.fn()} />);
    expect(screen.getByText(/Your unsaved changes are saved first/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Write it again with AI/ }));
    fireEvent.click(screen.getByRole('button', { name: /Start from the template/ }));
    expect(onWithAi).toHaveBeenCalled();
    expect(onTemplate).toHaveBeenCalled();
  });
});
