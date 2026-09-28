import type { CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import { parseCourseTree } from '@freechesscoach/chess-analysis';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CourseEpisodeWarnings } from './CourseEpisodeWarnings.js';

const tree = parseCourseTree('1. e4 e5 2. Nf3 Nc6 *');
const episode: CourseEpisode = { id: 'e1', role: 'line', focus: '', startNodeId: 'n1', endNodeId: 'n4', plies: [], drillNodeIds: [] };
const document: CourseDocument = {
  version: 1, kind: 'opening', title: 't', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'general',
  startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], episodes: [episode], takeaways: [], hookOptions: [], clipLinks: {}
};

describe('CourseEpisodeWarnings', () => {
  test('a hand-written line gets the verifier warnings', () => {
    const noted = { ...episode, plies: [{ nodeId: 'n3', text: 'Nf3 and White is +1.3. Qh8 wins.', arrows: [], course: true, video: false }] };
    render(<CourseEpisodeWarnings document={document} episode={noted} direction="" />);

    expect(screen.getByRole('region', { name: 'Checks' })).toBeTruthy();
    expect(screen.getByText('Qh8 in the line on n3 is not in the analysis')).toBeTruthy();
    expect(screen.getByText('"+1.3" in the line on n3 looks like an engine number')).toBeTruthy();
  });

  test('nothing when the episode is clean', () => {
    const noted = { ...episode, plies: [{ nodeId: 'n3', text: 'Nf3 attacks e5.', arrows: [], course: true, video: false }] };
    const { container } = render(<CourseEpisodeWarnings document={document} episode={noted} direction="" />);

    expect(container.textContent).toBe('');
  });
});
