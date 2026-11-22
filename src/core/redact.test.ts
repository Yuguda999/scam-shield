import { describe, expect, it } from 'vitest';
import { redact } from './redact';

describe('redact', () => {
  it('replaces Nigerian phone numbers in all common formats', () => {
    const r = redact('Call 08031234567 or +234 803 123 4567 or 2348031234567 now');
    expect(r.text).not.toMatch(/803/);
    expect(r.text).toContain('[PHONE_1]');
    // Same number in three formats maps to one placeholder.
    expect(r.redactions.filter((x) => x.kind === 'PHONE')).toHaveLength(1);
  });

  it('replaces account numbers and BVN/NIN but keeps amounts', () => {
    const r = redact('Send ₦50,000 to 0123456789 (GTBank). Your BVN 22123456789 is blocked.');
    expect(r.text).toContain('₦50,000');
    expect(r.text).toContain('[ACCOUNT_NUMBER_1]');
    expect(r.text).toContain('[BVN_OR_NIN_1]');
    expect(r.text).not.toMatch(/0123456789|22123456789/);
  });

  it('replaces OTP codes but keeps the word that signals the scam', () => {
    const r = redact('Your OTP is 482913, share it with our agent');
    expect(r.text).toBe('Your OTP is [OTP_1], share it with our agent');
  });

  it('replaces Luhn-valid card numbers only', () => {
    const r = redact('Card 4111 1111 1111 1111 expires soon');
    expect(r.text).toContain('[CARD_NUMBER_1]');
    expect(redact('Ref 1234 5678 9012 3456').text).not.toContain('CARD_NUMBER');
  });

  it('keeps link domains but strips paths and query strings', () => {
    const r = redact('Verify at https://gtb-secure-update.com/login?id=88123&t=abc today');
    expect(r.text).toContain('https://gtb-secure-update.com/[URL_DETAILS_1]');
    expect(r.text).not.toContain('88123');
  });

  it('replaces emails and supplied names', () => {
    const r = redact('Dear Amina Bello, reply to hr.recruit@gmail.com', ['Amina Bello']);
    expect(r.text).toBe('Dear [NAME_1], reply to [EMAIL_1]');
  });

  it('finds common name patterns without a model', () => {
    expect(redact('Hi, this is Tunde from HR at Dangote Group.').text).toBe('Hi, this is [NAME_1] from HR at Dangote Group.');
    expect(redact('Dear Customer, your account is blocked').text).toBe('Dear Customer, your account is blocked');
    expect(redact('Desc: TRF FROM CHIOMA OKAFOR. Avail Bal').text).toBe('Desc: TRF FROM [NAME_1]. Avail Bal');
    expect(redact('Contact Mr. Adebayo today').text).toBe('Contact Mr. [NAME_1] today');
  });

  it('leaves clean text alone', () => {
    const msg = 'Congratulations! You have won a brand new car. Pay delivery fee today.';
    expect(redact(msg)).toEqual({ text: msg, redactions: [] });
  });
});
