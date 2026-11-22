import { describe, expect, it } from 'vitest';
import { fingerprint, isoWeek, normalizeForFingerprint, tally } from './community';

describe('community helpers', () => {
  it('computes ISO week keys, including year boundaries', () => {
    expect(isoWeek(new Date('2026-11-22T12:00:00Z'))).toBe('2026-W47');
    expect(isoWeek(new Date('2026-11-23T12:00:00Z'))).toBe('2026-W48');
    expect(isoWeek(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
  });

  it('matches the same scam sent to different people', async () => {
    const a = 'Dear [NAME_1], send ₦15,000 to [ACCOUNT_NUMBER_1] for training. Call [PHONE_1]!';
    const b = 'Dear [NAME_1],  send N 20,000 to [ACCOUNT_NUMBER_1] for training. call [PHONE_2]';
    expect(normalizeForFingerprint(a)).toBe('dear send to for training call');
    expect(normalizeForFingerprint(b)).toBe('dear send n to for training call');
    expect(await fingerprint(a)).toHaveLength(64);
    expect(await fingerprint(a)).toBe(await fingerprint(a.replace('₦15,000', '₦99,000')));
  });

  it('tallies scam types by count', () => {
    expect(tally([{ scamType: 'a' }, { scamType: 'b' }, { scamType: 'a' }])).toEqual([
      { scamType: 'a', count: 2 },
      { scamType: 'b', count: 1 },
    ]);
  });
});
