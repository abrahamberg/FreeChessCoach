import { expect, test } from 'vitest';
import {
  CONFIDENCE_LEVELS,
  DIRECTIONS,
  EMITTABLE_CONFIDENCE_LEVELS,
  EVIDENCE_TRACKS,
  HISTORY_STATUSES,
  MECHANISMS,
  SCOPE_TAGS,
  SEVERITIES,
  ConfidenceLevelSchema,
  DirectionSchema,
  EvidenceTrackSchema,
  HistoryStatusSchema,
  MechanismSchema,
  ScopeTagSchema,
  SeveritySchema,
  MECHANISM_LABELS,
  DIRECTION_LABELS,
  HISTORY_STATUS_LABELS,
  SCOPE_TAG_LABELS,
  SEVERITY_LABELS,
  EVIDENCE_TRACK_LABELS,
  CONFIDENCE_LEVEL_LABELS
} from './axes.js';

test('mechanisms are the 10 §I.2 codes, K through S', () => {
  expect(MECHANISMS).toEqual(['K', 'M', 'V', 'R', 'G', 'C', 'J', 'X', 'L', 'S']);
  expect(new Set(MECHANISMS).size).toBe(10);
});

test('directions are the 4 §I.1 direction codes', () => {
  expect(DIRECTIONS).toEqual(['O', 'D', 'B', 'N']);
});

test('history statuses are the 8 §III.1 statuses', () => {
  expect(HISTORY_STATUSES).toEqual([
    'newly_observed',
    'persistent',
    'improving',
    'monitoring',
    'resolved',
    'regressed',
    'nonresponsive',
    'superseded'
  ]);
});

test('scope tags are the 12 §III.2 tags', () => {
  expect(SCOPE_TAGS).toHaveLength(12);
  expect(SCOPE_TAGS).toContain('general');
  expect(SCOPE_TAGS).toContain('device_interface_bound');
});

test('severities are the 4 §III.3 bands, ascending', () => {
  expect(SEVERITIES).toEqual(['minor', 'meaningful', 'major', 'decisive']);
});

test('evidence tracks are the 5 §4.1 tracks', () => {
  expect(EVIDENCE_TRACKS).toEqual([
    'game_leak',
    'knowledge_inventory',
    'process_finding',
    'state_finding',
    'curriculum_only_gap'
  ]);
});

test('confidence levels are the 4 §4.6 tiers, ascending, including confirmed', () => {
  expect(CONFIDENCE_LEVELS).toEqual(['insufficient', 'signal', 'probable', 'confirmed']);
});

test('nothing in this build can emit "confirmed" — no probe subsystem exists yet (plan Phase 52 scope decision)', () => {
  expect(EMITTABLE_CONFIDENCE_LEVELS).toEqual(['insufficient', 'signal', 'probable']);
  expect(EMITTABLE_CONFIDENCE_LEVELS).not.toContain('confirmed');
});

test('every axis value has a human label, and only those values', () => {
  for (const mechanism of MECHANISMS) expect(MECHANISM_LABELS[mechanism]).toBeTruthy();
  for (const direction of DIRECTIONS) expect(DIRECTION_LABELS[direction]).toBeTruthy();
  for (const status of HISTORY_STATUSES) expect(HISTORY_STATUS_LABELS[status]).toBeTruthy();
  for (const tag of SCOPE_TAGS) expect(SCOPE_TAG_LABELS[tag]).toBeTruthy();
  for (const severity of SEVERITIES) expect(SEVERITY_LABELS[severity]).toBeTruthy();
  for (const track of EVIDENCE_TRACKS) expect(EVIDENCE_TRACK_LABELS[track]).toBeTruthy();
  for (const level of CONFIDENCE_LEVELS) expect(CONFIDENCE_LEVEL_LABELS[level]).toBeTruthy();
});

test('zod schemas accept every valid value and reject junk', () => {
  for (const mechanism of MECHANISMS) expect(MechanismSchema.parse(mechanism)).toBe(mechanism);
  for (const direction of DIRECTIONS) expect(DirectionSchema.parse(direction)).toBe(direction);
  for (const status of HISTORY_STATUSES) expect(HistoryStatusSchema.parse(status)).toBe(status);
  for (const tag of SCOPE_TAGS) expect(ScopeTagSchema.parse(tag)).toBe(tag);
  for (const severity of SEVERITIES) expect(SeveritySchema.parse(severity)).toBe(severity);
  for (const track of EVIDENCE_TRACKS) expect(EvidenceTrackSchema.parse(track)).toBe(track);
  for (const level of CONFIDENCE_LEVELS) expect(ConfidenceLevelSchema.parse(level)).toBe(level);

  expect(() => MechanismSchema.parse('nope')).toThrow();
  expect(() => DirectionSchema.parse('nope')).toThrow();
  expect(() => HistoryStatusSchema.parse('nope')).toThrow();
  expect(() => ScopeTagSchema.parse('nope')).toThrow();
  expect(() => SeveritySchema.parse('nope')).toThrow();
  expect(() => EvidenceTrackSchema.parse('nope')).toThrow();
  expect(() => ConfidenceLevelSchema.parse('nope')).toThrow();
});
