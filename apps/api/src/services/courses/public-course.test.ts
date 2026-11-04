import type { CourseDossier } from '@freechesscoach/chess-analysis';
import type { CourseDocument } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { courseEvals } from './public-course.js';

describe('courseEvals', () => {
  const document = { nodes: [{ id: 'n1', san: 'd4' }, { id: 'n2', san: 'e5' }] } as unknown as CourseDocument;
  const sans: Record<string, string> = { n1: 'd4', n2: 'e5' };
  const node = (nodeId: string, tempting: object[]) => ({ nodeId, san: sans[nodeId] ?? 'e4', evalAfterCp: 30, quality: 'best', tempting });

  test("each move's evaluation, and each tempting move's under its own key", () => {
    const dossier = { nodes: [node('n1', []), node('n2', [{ san: 'Qxc3+', evalAfterCp: 150, quality: 'blunder' }]), node('gone', [])] } as unknown as CourseDossier;
    expect(courseEvals(document, dossier)).toEqual({ n1: { cp: 30, quality: 'best' }, n2: { cp: 30, quality: 'best' }, 'tempting:n2:Qxc3+': { cp: 150, quality: 'blunder' } });
  });

  test('a dossier whose tempting moves have no evaluation gives none for them', () => {
    const dossier = { nodes: [node('n2', [{ san: 'Qxc3+' }])] } as unknown as CourseDossier;
    expect(courseEvals(document, dossier)).toEqual({ n2: { cp: 30, quality: 'best' } });
    expect(courseEvals(document, null)).toEqual({});
  });
});
