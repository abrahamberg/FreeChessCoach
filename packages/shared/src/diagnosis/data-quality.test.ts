import { expect, test } from 'vitest';
import { DATA_QUALITY_GATES, DataQualityGateSchema } from './data-quality.js';

test('there are 20 gates (docs/diagnose.md §II.A), unique DQ-prefixed ids in spec order', () => {
  expect(DATA_QUALITY_GATES).toHaveLength(20);
  const ids = DATA_QUALITY_GATES.map((gate) => gate.id);
  expect(new Set(ids).size).toBe(20);
  expect(ids[0]).toBe('DQ-01');
  expect(ids[19]).toBe('DQ-20');
  for (const id of ids) expect(id).toMatch(/^DQ-\d{2}$/);
});

test('every gate validates against DataQualityGateSchema and has a non-empty label', () => {
  for (const gate of DATA_QUALITY_GATES) {
    expect(() => DataQualityGateSchema.parse(gate)).not.toThrow();
    expect(gate.label.length).toBeGreaterThan(0);
  }
});

test('every gate is blocking — §IV override 5 is unconditional: "No primary diagnosis may bypass a failed data gate"', () => {
  expect(DATA_QUALITY_GATES.every((gate) => gate.blocking)).toBe(true);
});

test('DQ-17 (the rules-knowledge legality-highlighting gate the RB family is scoped around) is present verbatim', () => {
  const dq17 = DATA_QUALITY_GATES.find((gate) => gate.id === 'DQ-17');
  expect(dq17?.label).toBe(
    'Chess.com legality highlighting masks the student’s actual rules knowledge. Use a direct probe.'
  );
});
