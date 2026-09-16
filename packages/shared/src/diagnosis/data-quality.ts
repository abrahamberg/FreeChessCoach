import { z } from 'zod';

/**
 * §II.A "Data-quality gates" — 20 preconditions, "not student weaknesses."
 * Every gate is `blocking: true`: §IV override 5 is unconditional ("No
 * primary diagnosis may bypass a failed data gate"), with no gate-specific
 * exception in the spec, so Phase 55's gate evaluation treats a fired gate
 * here as always disqualifying a primary diagnosis, never merely advisory.
 * The system must be allowed to return "Insufficient evidence" rather than
 * force a diagnosis past one of these.
 */
export const DataQualityGateIdSchema = z.string().regex(/^DQ-\d{2}$/);
export type DataQualityGateId = z.infer<typeof DataQualityGateIdSchema>;

export const DataQualityGateSchema = z.object({
  id: DataQualityGateIdSchema,
  label: z.string().min(1),
  blocking: z.boolean()
});
export type DataQualityGate = z.infer<typeof DataQualityGateSchema>;

export const DATA_QUALITY_GATES: readonly DataQualityGate[] = [
  { id: 'DQ-01', label: 'Insufficient recent rated games.', blocking: true },
  { id: 'DQ-02', label: 'Insufficient relevant opportunities.', blocking: true },
  { id: 'DQ-03', label: 'Mixed time-control pools.', blocking: true },
  { id: 'DQ-04', label: 'Missing or unreliable clock data.', blocking: true },
  {
    id: 'DQ-05',
    label: 'Suggested improvement is not human-reachable at the student’s level.',
    blocking: true
  },
  {
    id: 'DQ-06',
    label: 'Sample is dominated by one opening, opponent, side, or unusual session.',
    blocking: true
  },
  { id: 'DQ-07', label: 'Student saw engine analysis before reconstruction.', blocking: true },
  { id: 'DQ-08', label: 'New, provisional, or rapidly changing account rating.', blocking: true },
  {
    id: 'DQ-09',
    label: 'Incidents occurred only in completely lost or trivial positions.',
    blocking: true
  },
  {
    id: 'DQ-10',
    label: 'Theme classifier is uncertain or engine evaluation is unstable.',
    blocking: true
  },
  {
    id: 'DQ-11',
    label: 'Several recorded errors belong to one causal blunder cascade.',
    blocking: true
  },
  {
    id: 'DQ-12',
    label: 'Variants, odds games, unrated games, or nonstandard conditions contaminate the sample.',
    blocking: true
  },
  {
    id: 'DQ-13',
    label: 'Disconnects, lag, device failure, or interface errors explain the result.',
    blocking: true
  },
  {
    id: 'DQ-14',
    label: 'Assistance, sandbagging, account sharing, or rating manipulation is reasonably suspected.',
    blocking: true
  },
  {
    id: 'DQ-15',
    label: 'Different Rapid formats were pooled despite materially different clock demands.',
    blocking: true
  },
  {
    id: 'DQ-16',
    label: 'Only losses, only wins, or only engine-flagged blunders were selected.',
    blocking: true
  },
  {
    id: 'DQ-17',
    label: 'Chess.com legality highlighting masks the student’s actual rules knowledge. Use a direct probe.',
    blocking: true
  },
  {
    id: 'DQ-18',
    label: 'Session, sleep, interruption, or environmental metadata is missing for a state diagnosis.',
    blocking: true
  },
  {
    id: 'DQ-19',
    label: 'Verbal testing is confounded by language or response format; use a nonverbal equivalent.',
    blocking: true
  },
  {
    id: 'DQ-20',
    label: 'Board theme, orientation, display size, or accessibility settings may explain the visual error.',
    blocking: true
  }
];
