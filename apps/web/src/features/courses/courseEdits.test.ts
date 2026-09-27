import type { CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import { parseCourseTree } from '@freechesscoach/chess-analysis';
import { describe, expect, test } from 'vitest';
import { toBoardMarks } from './courseArrows.js';
import { addBeat, episodeNodeIds, moveLabel, removeBeat, setNote, updateBeat, updateEpisode } from './courseEdits.js';

const tree = parseCourseTree('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *');
const episode: CourseEpisode = { id: 'e1', role: 'line', focus: '', startNodeId: 'n2', endNodeId: 'n4', beats: [], notes: [], drillNodeIds: [] };
const document: CourseDocument = {
  version: 1, kind: 'opening_course', title: 't', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'general',
  startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], episodes: [episode], takeaways: [], hookOptions: [], clipLinks: {}
};

describe('course edits', () => {
  test('an episode spans its nodes along the tree, labelled with move numbers', () => {
    const byId = new Map(document.nodes.map((node) => [node.id, node]));

    expect(episodeNodeIds(document, episode)).toEqual(['n2', 'n3', 'n4']);
    expect(episodeNodeIds(document, { ...episode, startNodeId: 'n5' })).toEqual(['n4']);
    const [n2, n3] = [byId.get('n2'), byId.get('n3')];
    expect(n2 && moveLabel(document, n2)).toBe('1…e5');
    expect(n3 && moveLabel(document, n3)).toBe('2.Nf3');
  });

  test('notes are created on first edit and beats added, changed and removed', () => {
    let next = updateEpisode(document, 'e1', (current) => setNote(current, 'n3', { text: 'Develops.' }));
    next = updateEpisode(next, 'e1', (current) => setNote(current, 'n3', { arrows: [{ from: 'g1', to: 'f3', kind: 'idea' }] }));
    next = updateEpisode(next, 'e1', (current) => updateBeat(addBeat(addBeat(current, 'n2'), null), 1, { say: 'Hello' }));
    const [edited] = next.episodes;

    expect(edited?.notes).toEqual([{ nodeId: 'n3', text: 'Develops.', arrows: [{ from: 'g1', to: 'f3', kind: 'idea' }] }]);
    expect(edited?.beats.map((beat) => beat.say)).toEqual(['', 'Hello']);
    expect(edited && removeBeat(edited, 0).beats.map((beat) => beat.nodeId)).toEqual([null]);
  });

  test('a from === to arrow is drawn as a highlighted square', () => {
    const marks = toBoardMarks([{ from: 'e5', to: 'e5', kind: 'threat' }, { from: 'd2', to: 'd4', kind: 'best' }]);

    expect(marks.arrows).toEqual([{ from: 'd2', to: 'd4', color: 'var(--tactic-good)' }]);
    expect(marks.highlights.map((highlight) => highlight.square)).toEqual(['e5']);
  });
});
