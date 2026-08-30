/** Shared across every stats section (Task 30.2) — same null → "—"
 * convention as GameReportSummary's own formatPercent/formatScore. */
export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

export function formatCount(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

/** "found N of M" as chess.com's own "75% (3/5)" framing — used by the
 * tactics section's per-motif rows. */
export function formatFraction(found: number, total: number): string {
  const pct = total === 0 ? 0 : Math.round((found / total) * 100);
  return `${pct}% (${found}/${total})`;
}
