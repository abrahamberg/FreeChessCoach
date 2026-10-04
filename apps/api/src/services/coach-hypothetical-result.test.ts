import type { PositionAnalysis } from '@freechesscoach/shared';
import { describe, expect, it, vi } from 'vitest';
import { enrichHypotheticalLineResult } from './coach-hypothetical-result.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

const analysis = {
  fen: AFTER_E4_E5,
  bestMove: 'Nf3',
  lines: [{ moveSan: 'Nf3', pvSan: ['Nf3', 'Nc6'], cp: 20, mateIn: null }],
  features: { boardState: 'none', forks: [], captureOpportunities: [] }
} as unknown as PositionAnalysis;

const line = (patch: object) => ({ ok: true, continuedLine: false, basePly: 0, startFen: START, moves: [{ san: 'e4' }, { san: 'e5' }], resultFen: AFTER_E4_E5, ...patch });

describe('enrichHypotheticalLineResult', () => {
  it('says what each move does, then the end position and the engine verdict', async () => {
    const analyzePosition = vi.fn().mockResolvedValue(analysis);

    const result = (await enrichHypotheticalLineResult(analyzePosition, line({}))) as Record<string, unknown>;

    expect(result.lineFacts).toHaveLength(2);
    expect(String(result.lineFacts).startsWith('e4 — white')).toBe(true);
    expect(result.endPosition).toContain('white to move');
    expect(String(result.engine)).toContain('Best move: Nf3');
    expect(analyzePosition).toHaveBeenCalledWith(AFTER_E4_E5);
  });

  it('keeps the line when the engine is down', async () => {
    const result = (await enrichHypotheticalLineResult(() => Promise.reject(new Error('down')), line({}))) as Record<string, unknown>;
    expect(result.lineFacts).toHaveLength(2);
    expect(String(result.engine)).toContain('unavailable');
  });

  it('an illegal line reports the moves that stood, with no engine call', async () => {
    const analyzePosition = vi.fn();
    const failed = line({ ok: false, moves: [{ san: 'e4' }], resultFen: undefined, error: 'Illegal move: Ke3 (Black to move)' });

    const result = (await enrichHypotheticalLineResult(analyzePosition, failed)) as Record<string, unknown>;

    expect(result.lineFacts).toHaveLength(1);
    expect(result.engine).toBeUndefined();
    expect(analyzePosition).not.toHaveBeenCalled();
  });

  it('passes a result it cannot read through unchanged', async () => {
    const odd = { acknowledged: true };
    await expect(enrichHypotheticalLineResult(vi.fn(), odd)).resolves.toBe(odd);
  });
});
