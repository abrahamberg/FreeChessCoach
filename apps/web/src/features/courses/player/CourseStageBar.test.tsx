import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourseStageBar } from './CourseStageBar.js';

describe('CourseStageBar', () => {
  test('ticks finished stages, marks the current one, and opens any stage', () => {
    const onSelect = vi.fn();
    render(<CourseStageBar current="practice" done={new Set(['play_through'])} onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /Play through, done/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Practice/ }).getAttribute('aria-current')).toBe('step');
    fireEvent.click(screen.getByRole('button', { name: /Both sides/ }));
    expect(onSelect).toHaveBeenCalledWith('full_drill');
  });
});
