import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CourseBoardLayout } from './CourseBoardLayout.js';

const parts = {
  episodes: <span>episodes</span>,
  explorer: <span>explorer</span>,
  board: <span>board</span>,
  coach: <span>coach</span>,
  strip: <span>strip</span>,
  bottomBar: <span>bar</span>
};

describe('CourseBoardLayout', () => {
  test('desktop: the explorer column (episodes first), the board, the coach; no strip or bottom bar', () => {
    const { container } = render(<CourseBoardLayout isDesktop {...parts} />);
    const columns = [...container.querySelector('.game-review-body.desktop')!.children];
    expect(columns.map((column) => column.className)).toEqual([
      'game-review-explorer-column course-layout__explorer',
      'session-board-column',
      'game-review-notes-column course-layout__coach'
    ]);
    expect(columns[0]!.textContent).toBe('episodesexplorer');
    expect(container.textContent).not.toContain('strip');
    expect(container.textContent).not.toContain('bar');
  });

  test('phone: episodes, the coach, the board, the strip, then the bottom bar; no explorer', () => {
    const { container } = render(<CourseBoardLayout isDesktop={false} {...parts} />);
    const body = container.querySelector('.game-review-body.mobile')!;
    expect([...body.children].map((child) => child.textContent)).toEqual(['episodes', 'coach', 'board', 'strip']);
    expect(body.className).toContain('has-course-bar');
    expect(container.querySelector('.board-bottom-bar')!.textContent).toBe('bar');
    expect(container.textContent).not.toContain('explorer');
  });
});
