/** Shared across every stats section (Task 30.2) — same null → "—"
 * convention as GameReportSummary's own formatPercent/formatScore. */
export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

export function formatCount(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}
