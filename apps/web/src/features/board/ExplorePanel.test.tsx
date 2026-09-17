import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ExplorePanel } from './ExplorePanel.js';

describe('ExplorePanel', () => {
  test('collapsed by default, showing only the small "Explore on your own" icon toggle', () => {
    render(<ExplorePanel isOpen={false} onOpen={vi.fn()} onClose={vi.fn()} status="idle" evaluation={null} />);

    expect(screen.getByRole('button', { name: /explore on your own/i })).toBeInTheDocument();
    expect(document.querySelector('.explore-panel-pill')).not.toBeInTheDocument();
  });

  test('clicking the toggle calls onOpen and, once open, shows the compact exploration pill', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<ExplorePanel isOpen={false} onOpen={onOpen} onClose={vi.fn()} status="idle" evaluation={null} />);

    await user.click(screen.getByRole('button', { name: /explore on your own/i }));

    expect(onOpen).toHaveBeenCalledOnce();
  });

  test('renders the word-based evaluation once available, never a number', () => {
    render(<ExplorePanel isOpen status="ready" evaluation="White is better" onOpen={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('White is better')).toBeInTheDocument();
    expect(document.querySelector('.explore-panel-pill')).toBeInTheDocument();
  });

  test('shows "thinking…" while a request is in flight and no evaluation has arrived yet', () => {
    render(<ExplorePanel isOpen status="loading" evaluation={null} onOpen={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('thinking…')).toBeInTheDocument();
  });

  test('shows an error message if the engine pipeline request fails', () => {
    render(<ExplorePanel isOpen status="error" evaluation={null} onOpen={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText(/couldn't reach the engine/i)).toBeInTheDocument();
  });

  test('the pill\'s own close icon calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ExplorePanel isOpen status="ready" evaluation="The position is roughly equal" onOpen={vi.fn()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /stop exploring/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
