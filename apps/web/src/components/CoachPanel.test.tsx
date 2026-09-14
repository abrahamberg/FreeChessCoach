import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CoachPanel } from './CoachPanel.js';

describe('CoachPanel', () => {
  test('renders its children and a class matching the current state', () => {
    const { container } = render(
      <CoachPanel state="normal" onStateChange={vi.fn()}>
        <p>coach note</p>
      </CoachPanel>
    );

    expect(screen.getByText('coach note')).toBeInTheDocument();
    expect(container.querySelector('.coach-panel--normal')).toBeInTheDocument();
  });

  test('tapping the handle toggles normal -> expanded', () => {
    const onStateChange = vi.fn();
    render(
      <CoachPanel state="normal" onStateChange={onStateChange}>
        <p>note</p>
      </CoachPanel>
    );
    const handle = screen.getByRole('button', { name: /expand coach panel/i });

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 100 });

    expect(onStateChange).toHaveBeenCalledWith('expanded');
  });

  test('tapping the handle while expanded collapses back to normal', () => {
    const onStateChange = vi.fn();
    render(
      <CoachPanel state="expanded" onStateChange={onStateChange}>
        <p>note</p>
      </CoachPanel>
    );
    const handle = screen.getByRole('button', { name: /collapse coach panel/i });

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 100 });

    expect(onStateChange).toHaveBeenCalledWith('normal');
  });

  test('dragging the handle up past the threshold expands', () => {
    const onStateChange = vi.fn();
    render(
      <CoachPanel state="normal" onStateChange={onStateChange}>
        <p>note</p>
      </CoachPanel>
    );
    const handle = screen.getByRole('button', { name: /expand coach panel/i });

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 200 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 130 });

    expect(onStateChange).toHaveBeenCalledWith('expanded');
  });

  test('dragging the handle down past the threshold collapses', () => {
    const onStateChange = vi.fn();
    render(
      <CoachPanel state="expanded" onStateChange={onStateChange}>
        <p>note</p>
      </CoachPanel>
    );
    const handle = screen.getByRole('button', { name: /collapse coach panel/i });

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 170 });

    expect(onStateChange).toHaveBeenCalledWith('normal');
  });

  test('a drag past the threshold does not also fire the tap toggle on release', () => {
    const onStateChange = vi.fn();
    render(
      <CoachPanel state="normal" onStateChange={onStateChange}>
        <p>note</p>
      </CoachPanel>
    );
    const handle = screen.getByRole('button', { name: /expand coach panel/i });

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 200 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 130 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 130 });

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith('expanded');
  });
});
