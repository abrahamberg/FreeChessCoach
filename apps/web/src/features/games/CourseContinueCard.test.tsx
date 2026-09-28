import type { CourseEnrollment, GameListItem } from '@freechesscoach/shared';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { CourseContinueCard } from './CourseContinueCard.js';
import { continueItems } from './continueItems.js';

const course: CourseEnrollment = {
  slug: 'englund-trap-aaaaaaaaaaaa',
  title: 'The Englund trap',
  kind: 'trap',
  stage: 'drill',
  place: { episode: 0, step: 0, practice: {} },
  stagesDone: ['play_through', 'practice'],
  startedAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-27T10:00:00.000Z',
  completedAt: null
};

describe('CourseContinueCard', () => {
  test('shows the course, its stage and progress, and opens it where the learner left it', () => {
    render(
      <MemoryRouter>
        <CourseContinueCard course={course} />
      </MemoryRouter>
    );
    expect(screen.getByText('Course')).toBeTruthy();
    expect(screen.getByText('The Englund trap')).toBeTruthy();
    expect(screen.getByText('Stage 3 of 4: Drill')).toBeTruthy();
    const progress = screen.getByRole('progressbar', { name: '2 of 4 stages done' });
    expect(progress.getAttribute('value')).toBe('2');
    expect(progress.getAttribute('max')).toBe('4');
    expect(screen.getByRole('link', { name: 'Continue course: The Englund trap' }).getAttribute('href')).toBe('/courses/englund-trap-aaaaaaaaaaaa');
  });
});

describe('continueItems', () => {
  const game = (id: string, sessionStartedAt: string) => ({ id, sessionStartedAt, createdAt: '2026-01-01T00:00:00.000Z' }) as GameListItem;

  test('mixes game sessions and unfinished courses, most recent first; finished courses stay out', () => {
    const finished = { ...course, slug: 'done', completedAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-28T09:00:00.000Z' };
    const items = continueItems([game('old', '2026-09-25T00:00:00.000Z'), game('new', '2026-09-28T08:00:00.000Z')], [course, finished]);
    expect(items.map((item) => (item.kind === 'game' ? item.game.id : item.course.slug))).toEqual(['new', 'englund-trap-aaaaaaaaaaaa', 'old']);
  });
});
