import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MoveQualityBadgeOverlay } from './MoveQualityBadgeOverlay.js';

describe('MoveQualityBadgeOverlay', () => {
  test('white orientation: e4 sits 4 files in, 4 rows down from the top', () => {
    render(<MoveQualityBadgeOverlay square="e4" quality="good" orientation="white" />);
    const overlay = screen.getByText('✓').parentElement;
    expect(overlay).toHaveStyle({ left: '50%', top: '50%' });
  });

  test('white orientation: a8 sits at the top-left corner', () => {
    render(<MoveQualityBadgeOverlay square="a8" quality="good" orientation="white" />);
    const overlay = screen.getByText('✓').parentElement;
    expect(overlay).toHaveStyle({ left: '0%', top: '0%' });
  });

  test('black orientation flips both file and rank', () => {
    render(<MoveQualityBadgeOverlay square="a8" quality="good" orientation="black" />);
    const overlay = screen.getByText('✓').parentElement;
    expect(overlay).toHaveStyle({ left: '87.5%', top: '87.5%' });
  });

  test('renders the tier-specific glyph and color, not just the good-move checkmark', () => {
    render(<MoveQualityBadgeOverlay square="e4" quality="blunder" orientation="white" />);
    expect(screen.getByText('??')).toHaveClass('move-quality-badge-overlay__icon--blunder');
  });
});
