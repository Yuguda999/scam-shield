import { describe, expect, it } from 'vitest';
import { parseCheckResult } from './parse';

describe('parseCheckResult', () => {
  it('parses fenced JSON from small models', () => {
    const r = parseCheckResult(
      '```json\n{"verdict":"scam","risk":92,"scamType":"otp_or_pin_request","summary":"Asks for your OTP.","redFlags":[{"quote":"send the OTP","why":"Banks never ask for OTPs."}],"advice":["Do not share it."]}\n```',
    );
    expect(r.verdict).toBe('scam');
    expect(r.risk).toBe(92);
    expect(r.redFlags).toHaveLength(1);
  });

  it('clamps and repairs out-of-schema values', () => {
    const r = parseCheckResult('{"verdict":"safe","risk":180,"scamType":"bogus","summary":"","redFlags":"x","advice":[1,""]}');
    expect(r.risk).toBe(100);
    expect(r.verdict).toBe('suspicious'); // never "safe" with a high score
    expect(r.scamType).toBe('other');
    expect(r.redFlags).toEqual([]);
    expect(r.advice).toEqual(['1']);
  });

  it('throws a friendly error on non-JSON output', () => {
    expect(() => parseCheckResult('I cannot help with that')).toThrow(/try again/);
  });
});
