import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { AvatarNoteRow } from './AvatarNoteRow.js';

describe('AvatarNoteRow', () => {
  test('renders its children and an optional action', () => {
    render(
      <AvatarNoteRow action={<button type="button">Toggle</button>}>
        <span data-testid="avatar">A</span>
        <span data-testid="card">Card content</span>
      </AvatarNoteRow>
    );

    expect(screen.getByTestId('avatar')).toBeInTheDocument();
    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle' })).toBeInTheDocument();
  });

  test('applies the base class plus any caller-supplied modifier class', () => {
    render(
      <AvatarNoteRow className="move-note-card-row">
        <span>content</span>
      </AvatarNoteRow>
    );

    const row = screen.getByText('content').parentElement;
    expect(row).toHaveClass('avatar-note-row');
    expect(row).toHaveClass('move-note-card-row');
  });

  test('omits the action wrapper entirely when no action is given', () => {
    render(
      <AvatarNoteRow>
        <span>content</span>
      </AvatarNoteRow>
    );

    expect(document.querySelector('.avatar-note-row__action')).not.toBeInTheDocument();
  });
});
