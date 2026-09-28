import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { CourseStudioHeader, type CourseStudioHeaderProps } from './CourseStudioHeader.js';

function renderHeader(overrides: Partial<CourseStudioHeaderProps> = {}) {
  const props: CourseStudioHeaderProps = {
    title: 'The Englund trap',
    onTitle: vi.fn(),
    status: 'unlisted',
    dirty: false,
    saving: false,
    onSave: vi.fn(),
    onPreviewClip: vi.fn(),
    onPreviewLearner: vi.fn(),
    onPublish: vi.fn(),
    published: true,
    more: [{ label: 'Build without AI', onSelect: vi.fn() }],
    ...overrides
  };
  render(
    <MemoryRouter>
      <CourseStudioHeader {...props} />
    </MemoryRouter>
  );
  return props;
}

describe('CourseStudioHeader', () => {
  test('back to the studio, the title in place, where the course stands, and its actions', () => {
    const props = renderHeader();
    expect(screen.getByRole('link', { name: 'Back to the Course studio' })).toHaveAttribute('href', '/studio');
    fireEvent.change(screen.getByRole('textbox', { name: 'Course title' }), { target: { value: 'The Englund Gambit' } });
    expect(props.onTitle).toHaveBeenCalledWith('The Englund Gambit');
    expect(screen.getByText('Unlisted')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Saved');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'As learner' }));
    expect(props.onPreviewLearner).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Publish again' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'More course actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Build without AI' }));
    expect(props.more[0]!.onSelect).toHaveBeenCalled();
  });

  test('unsaved changes can be saved; nothing to preview yet is disabled', () => {
    const props = renderHeader({ dirty: true, onPreviewClip: undefined, published: false });
    expect(screen.getByRole('status').textContent).toBe('Unsaved changes');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(props.onSave).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Video' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy();
  });
});
