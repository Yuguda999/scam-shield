import { SCAM_TYPES, type CheckResult, type ScamType, type Verdict } from './types';

const VERDICTS: Verdict[] = ['scam', 'suspicious', 'safe'];

/**
 * Parse and sanitise model output. Small on-device models occasionally wrap
 * JSON in code fences or drift outside the schema, so every field is checked
 * and clamped rather than trusted.
 */
export function parseCheckResult(raw: string): CheckResult {
  const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return a result. Please try again.');
  const o = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;

  let risk = Math.round(Number(o.risk));
  if (!Number.isFinite(risk)) risk = 50;
  risk = Math.min(100, Math.max(0, risk));

  let verdict = VERDICTS.includes(o.verdict as Verdict) ? (o.verdict as Verdict) : risk >= 70 ? 'scam' : risk >= 35 ? 'suspicious' : 'safe';
  // Keep verdict and score consistent so the UI never shows "safe" at 90%.
  if (verdict === 'safe' && risk >= 60) verdict = 'suspicious';
  if (verdict === 'scam' && risk < 40) risk = 70;

  const scamType = (SCAM_TYPES as readonly string[]).includes(o.scamType as string) ? (o.scamType as ScamType) : verdict === 'safe' ? 'none' : 'other';

  const redFlags = Array.isArray(o.redFlags)
    ? o.redFlags
        .filter((f): f is { quote: unknown; why: unknown } => typeof f === 'object' && f !== null)
        .map((f) => ({ quote: String(f.quote ?? '').trim().slice(0, 200), why: String(f.why ?? '').trim().slice(0, 300) }))
        .filter((f) => f.why)
        .slice(0, 4)
    : [];

  const advice = Array.isArray(o.advice) ? o.advice.map((a) => String(a).trim()).filter(Boolean).slice(0, 3) : [];

  return {
    verdict,
    risk,
    scamType,
    summary: String(o.summary ?? '').trim() || 'No summary returned.',
    redFlags,
    advice,
  };
}
