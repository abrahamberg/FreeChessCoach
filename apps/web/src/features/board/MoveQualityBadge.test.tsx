import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MoveQualityBadge } from './MoveQualityBadge.js';

describe('MoveQualityBadge', () => {
  test('renders nothing for a good move', () => {
    const { container } = render(<MoveQualityBadge quality="good" size="md" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when quality is undefined', () => {
    const { container } = render(<MoveQualityBadge quality={undefined} size="md" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders the star glyph for best, sized md', () => {
    render(<MoveQualityBadge quality="best" size="md" />);
    const badge = screen.getByText('★');
    expect(badge).toHaveClass('move-quality-badge--best');
    expect(badge).toHaveClass('move-quality-badge--md');
  });

  test('renders the X glyph for miss, sized sm', () => {
    render(<MoveQualityBadge quality="miss" size="sm" />);
    const badge = screen.getByText('✕');
    expect(badge).toHaveClass('move-quality-badge--miss');
    expect(badge).toHaveClass('move-quality-badge--sm');
  });

  test('renders the double-exclamation glyph for brilliant', () => {
    render(<MoveQualityBadge quality="brilliant" size="md" />);
    expect(screen.getByText('!!')).toHaveClass('move-quality-badge--brilliant');
  });

  test('renders the exclamation glyph for great', () => {
    render(<MoveQualityBadge quality="great" size="md" />);
    expect(screen.getByText('!')).toHaveClass('move-quality-badge--great');
  });

  test('renders the check glyph for excellent', () => {
    render(<MoveQualityBadge quality="excellent" size="md" />);
    expect(screen.getByText('✓')).toHaveClass('move-quality-badge--excellent');
  });

  test('renders the book glyph for a theory move', () => {
    render(<MoveQualityBadge quality="book" size="md" />);
    expect(screen.getByText('📖')).toHaveClass('move-quality-badge--book');
  });

  test('renders the inaccuracy glyph', () => {
    render(<MoveQualityBadge quality="inaccuracy" size="md" />);
    expect(screen.getByText('?!')).toHaveClass('move-quality-badge--inaccuracy');
  });

  test('renders the forced-move glyph', () => {
    render(<MoveQualityBadge quality="forced" size="md" />);
    expect(screen.getByText('→')).toHaveClass('move-quality-badge--forced');
  });
});
