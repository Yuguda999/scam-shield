/**
 * On-device redaction. Runs before ANY text is sent to the cloud.
 *
 * Personal identifiers are replaced with typed placeholders so the cloud model
 * still sees the *shape* of the message (e.g. "send ₦50,000 to [ACCOUNT_NUMBER]")
 * without ever receiving the real values. Scam signals that are not personal
 * (amounts, link domains, urgency words) are deliberately kept.
 */

export type RedactionKind =
  | 'EMAIL'
  | 'PHONE'
  | 'CARD_NUMBER'
  | 'BVN_OR_NIN'
  | 'ACCOUNT_NUMBER'
  | 'OTP'
  | 'URL_DETAILS'
  | 'NAME';

export interface Redaction {
  kind: RedactionKind;
  /** Placeholder that replaced the value, e.g. "[PHONE_1]". */
  placeholder: string;
}

export interface RedactionResult {
  text: string;
  redactions: Redaction[];
}

function luhnOk(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

interface Rule {
  kind: RedactionKind;
  re: RegExp;
  /** Return null to keep the match unchanged; otherwise the replacement (without placeholder numbering). */
  accept?: (match: string, groups: string[]) => boolean;
  /** Custom replacement builder; receives the placeholder. */
  replace?: (match: string, placeholder: string, groups: string[]) => string;
}

// Order matters: the most specific patterns run first so a card number is not
// mistaken for an account number, and OTPs are caught before generic digits.
const RULES: Rule[] = [
  { kind: 'EMAIL', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  {
    // Keep scheme + host (a strong scam signal), drop path/query which can carry tokens or IDs.
    kind: 'URL_DETAILS',
    re: /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,})(\/[^\s)]*)/gi,
    accept: (_m, g) => (g[1] ?? '').length > 1,
    replace: (_m, placeholder, g) => `${g[0]}/${placeholder}`,
  },
  {
    kind: 'OTP',
    re: /\b(otp|code|pin|token|password)(\s*(?:is|:|-)?\s*)(\d{4,8})\b/gi,
    replace: (_m, placeholder, g) => `${g[0]}${g[1]}${placeholder}`,
  },
  {
    kind: 'CARD_NUMBER',
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    accept: (m) => {
      const d = m.replace(/\D/g, '');
      return d.length >= 13 && d.length <= 19 && luhnOk(d);
    },
  },
  {
    // Nigerian mobile numbers: +234 / 234 / 0 followed by 7/8/9 and 0/1, then 8 digits.
    kind: 'PHONE',
    re: /(?:\+?234[\s-]?|\b0)[789][01]\d(?:[\s-]?\d){7}\b/g,
  },
  {
    // Generic international numbers with an explicit + prefix.
    kind: 'PHONE',
    re: /\+\d{1,3}[\s-]?\d(?:[\s-]?\d){6,12}\b/g,
  },
  { kind: 'BVN_OR_NIN', re: /\b\d{11}\b/g },
  { kind: 'ACCOUNT_NUMBER', re: /\b\d{10}\b/g },
];

export function redact(input: string, names: string[] = []): RedactionResult {
  let text = input;
  const redactions: Redaction[] = [];
  const counters = new Map<RedactionKind, number>();
  const seen = new Map<string, string>(); // same value -> same placeholder

  const placeholderFor = (kind: RedactionKind, value: string): string => {
    const key = `${kind}:${value}`;
    const existing = seen.get(key);
    if (existing) return existing;
    const n = (counters.get(kind) ?? 0) + 1;
    counters.set(kind, n);
    const placeholder = `[${kind}_${n}]`;
    seen.set(key, placeholder);
    redactions.push({ kind, placeholder });
    return placeholder;
  };

  for (const rule of RULES) {
    text = text.replace(rule.re, (match: string, ...rest: unknown[]) => {
      // rest = [...groups, offset, input, (namedGroups?)]
      const groups = rest.filter((r) => typeof r === 'string' || r === undefined).slice(0, -1) as string[];
      if (match.includes('[') && /\[[A-Z_]+_\d+\]/.test(match)) return match;
      if (rule.accept && !rule.accept(match, groups)) return match;
      const digits = match.replace(/\D/g, '');
      const valueKey =
        rule.kind === 'OTP' || rule.kind === 'URL_DETAILS'
          ? match
          : rule.kind === 'PHONE'
            ? digits.slice(-10) // +234 803…, 234803…, 0803… are the same number
            : digits || match;
      const placeholder = placeholderFor(rule.kind, valueKey);
      return rule.replace ? rule.replace(match, placeholder, groups) : placeholder;
    });
  }

  // Person names found by the on-device model (or the user) are replaced last.
  for (const raw of names) {
    const name = raw.trim();
    if (name.length < 2) continue;
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (!re.test(text)) continue;
    const placeholder = placeholderFor('NAME', name.toLowerCase());
    text = text.replace(re, placeholder);
  }

  return { text, redactions };
}
