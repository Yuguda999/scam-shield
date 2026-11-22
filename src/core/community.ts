/** Pure helpers for community reports (unit-tested; no Firebase imports). */

/** ISO-8601 week key, e.g. "2026-W48". Used as an equality filter so no composite index is needed. */
export function isoWeek(d: Date = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Normalise a (redacted) message so copies of the same scam sent to different
 * people match: placeholders, digits, amounts, punctuation and case are removed.
 */
export function normalizeForFingerprint(redactedText: string): string {
  return redactedText
    .toLowerCase()
    .replace(/\[[a-z_]+_\d+\]/g, ' ')
    .replace(/[₦$€£]?\s?\d[\d,.]*/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

export async function fingerprint(redactedText: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeForFingerprint(redactedText));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface TrendRow {
  scamType: string;
  count: number;
}

export function tally(rows: { scamType: string }[]): TrendRow[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.scamType, (m.get(r.scamType) ?? 0) + 1);
  return [...m].map(([scamType, count]) => ({ scamType, count })).sort((a, b) => b.count - a.count);
}
