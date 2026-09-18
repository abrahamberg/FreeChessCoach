import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MoveCard } from './MoveCard.js';

describe('MoveCard', () => {
  test('renders the SAN the student played', () => {
    render(<MoveCard san="Nxd5" fen="startpos" />);
    expect(screen.getByText(/you played/i)).toBeInTheDocument();
    expect(screen.getByText('Nxd5')).toBeInTheDocument();
  });

  test('flags when the student used a hint before this move', () => {
    render(<MoveCard san="Nxd5" fen="startpos" usedHint />);
    expect(screen.getByText(/used a hint/i)).toBeInTheDocument();
  });

  test('shows no hint note when usedHint is omitted', () => {
    render(<MoveCard san="Nxd5" fen="startpos" />);
    expect(screen.queryByText(/used a hint/i)).not.toBeInTheDocument();
  });
});
