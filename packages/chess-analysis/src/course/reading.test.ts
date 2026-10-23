import { describe, expect, it } from 'vitest';
import { parseReadingSections, sectionFen } from './reading.js';

const FEN = '8/8/8/8/8/5N2/5PPP/5RK1 w - - 0 1';

describe('parseReadingSections', () => {
  it('keeps the board until a new diagram and drops marks and headings', () => {
    const text = `# Title\n\nFirst paragraph.\n\n<!-- end of PDF page p4R -->\n\nSecond one.\n\n\`\`\`fen\n${FEN}\n\`\`\`\n\nAfter the diagram.\n\nStill the same board.`;
    const { sections, errors } = parseReadingSections(text);
    expect(errors).toEqual([]);
    expect(sections.map((section) => section.text)).toEqual(['First paragraph.\n\nSecond one.', 'After the diagram.\n\nStill the same board.']);
    expect(sections.map((section) => section.fen)).toEqual([undefined, FEN]);
    expect(sectionFen(sections, 0)).toBeNull();
    expect(sectionFen(sections, 1)).toBe(FEN);
  });

  it('reports a diagram that is not a position', () => {
    expect(parseReadingSections('```fen\nnot a fen\n```\n\nText.').errors).toHaveLength(1);
  });
});
