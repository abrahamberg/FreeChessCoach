import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { UserAvatar } from './UserAvatar.js';

describe('UserAvatar', () => {
  test('a handle-style name yields two initials, one per segment', () => {
    render(<UserAvatar displayName="Dany_Abr" />);
    expect(screen.getByTestId('user-avatar')).toHaveTextContent('DA');
  });

  test('a single-word name yields one initial', () => {
    render(<UserAvatar displayName="daniel" />);
    expect(screen.getByTestId('user-avatar')).toHaveTextContent('D');
  });

  test('a space-separated full name yields its first two initials', () => {
    render(<UserAvatar displayName="Daniel Cohen" />);
    expect(screen.getByTestId('user-avatar')).toHaveTextContent('DC');
  });

  test('no display name falls back to a placeholder rather than rendering blank', () => {
    render(<UserAvatar displayName={undefined} />);
    expect(screen.getByTestId('user-avatar')).toHaveTextContent('?');
  });
});
