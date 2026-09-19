import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { PgnUploadForm } from './PgnUploadForm.js';

describe('PgnUploadForm (design.md §4.2)', () => {
  test('offers no import buttons until a file has been read', () => {
    render(<PgnUploadForm onSubmit={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Analyze' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Get coaching session' })).not.toBeInTheDocument();
  });

  test.each([
    ['Analyze', 'review'],
    ['Get coaching session', 'coach']
  ] as const)('reads the selected .pgn file, then the %s button submits its text with intent "%s"', async (label, intent) => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<PgnUploadForm onSubmit={onSubmit} />);

    const file = new File(['1. e4 e5 2. Nf3 *'], 'game.pgn', { type: 'application/x-chess-pgn' });
    await user.upload(screen.getByLabelText(/pgn file/i), file);
    await user.click(await screen.findByRole('button', { name: label }));

    expect(onSubmit).toHaveBeenCalledWith({ pgn: '1. e4 e5 2. Nf3 *', source: 'upload' }, intent);
  });

  test('only accepts .pgn files', () => {
    render(<PgnUploadForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/pgn file/i)).toHaveAttribute('accept', '.pgn');
  });
});
