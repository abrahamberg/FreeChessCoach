import { expect, test } from 'vitest';
import { DiagnosisRefSchema, parseDiagnosisRef, renderDiagnosisRef } from './ref.js';

test('TA-07.R.D round-trips through render and parse', () => {
  const ref = { code: 'TA-07', mechanism: 'R', direction: 'D' } as const;
  const rendered = renderDiagnosisRef(ref);
  expect(rendered).toBe('TA-07.R.D');
  expect(parseDiagnosisRef(rendered)).toEqual(ref);
});

test('a direction: N ref renders without a dangling separator, and re-parses back to N', () => {
  const ref = { code: 'OP-14', mechanism: 'M', direction: 'N' } as const;
  const rendered = renderDiagnosisRef(ref);
  expect(rendered).toBe('OP-14.M');
  expect(rendered.endsWith('.')).toBe(false);
  expect(parseDiagnosisRef(rendered)).toEqual(ref);
});

test('an unknown/malformed code fails validation', () => {
  expect(() => parseDiagnosisRef('not-a-code')).toThrow();
  expect(() => parseDiagnosisRef('ta07.R.D')).toThrow();
  expect(() => DiagnosisRefSchema.parse({ code: 'TA-07', mechanism: 'Z', direction: 'D' })).toThrow();
  expect(() => DiagnosisRefSchema.parse({ code: 'TA07', mechanism: 'R', direction: 'D' })).toThrow();
});

test('the parameterized form preserves its context string (spec §I.1 examples, verbatim)', () => {
  const rendered = 'OP-14.M [Sicilian Najdorf, 6.Be3 e5, Black, move-order recall]';
  const ref = parseDiagnosisRef(rendered);
  expect(ref).toEqual({
    code: 'OP-14',
    mechanism: 'M',
    direction: 'N',
    context: 'Sicilian Najdorf, 6.Be3 e5, Black, move-order recall'
  });
  expect(renderDiagnosisRef(ref)).toBe(rendered);
});

test('a direction plus context round-trips (spec: TA-07.R.D [defensive knight forks, after exchanges])', () => {
  const rendered = 'TA-07.R.D [defensive knight forks, after exchanges]';
  const ref = parseDiagnosisRef(rendered);
  expect(ref).toEqual({
    code: 'TA-07',
    mechanism: 'R',
    direction: 'D',
    context: 'defensive knight forks, after exchanges'
  });
  expect(renderDiagnosisRef(ref)).toBe(rendered);
});
