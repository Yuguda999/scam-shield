import { SCAM_TYPES } from './types';

/**
 * Prompts are plain text with the instructions inline, because Chrome's
 * on-device model ignores systemInstruction. The same prompt therefore works
 * on-device and in the cloud. Remote Config can override every value here.
 */

export const DEFAULT_PATTERNS = [
  'Credit "alerts" sent by SMS/WhatsApp from a normal phone number, or a screenshot of a transfer, used to get goods released before money lands.',
  'Messages saying your account, BVN, NIN or SIM will be blocked unless you "update" via a link or call.',
  'Anyone asking for an OTP, PIN, card number or password. Banks never ask for these.',
  'Job offers that need an "application", "training" or "registration" fee, or interviews only on WhatsApp/Telegram.',
  'Investments promising fixed high returns (e.g. 20-50% monthly), "double your money", referral bonuses, crypto trading platforms that freeze withdrawals.',
  'Loan apps that demand an upfront "processing" fee or threaten to message your contacts.',
  'Prizes, giveaways, grants or "foundation" money you never applied for that need a fee to claim.',
  'People claiming to be EFCC, police, bank staff, a relative with a new number, or a boss, asking for urgent money.',
  'Delivery or customs messages asking for a small fee to release a package.',
  'Links with misspelled bank names or odd domains (e.g. gtb-secure-update.com, zenith-verify.top).',
];

export function checkPrompt(message: string, patterns: string[] = DEFAULT_PATTERNS, redacted = false): string {
  return [
    'You are Scam Shield, a fraud checker for people in Nigeria. Decide if the MESSAGE below is a scam.',
    '',
    'Known scam patterns:',
    ...patterns.map((p) => `- ${p}`),
    '',
    'Rules:',
    '- verdict: "scam" if it clearly matches a scam pattern, "suspicious" if some warning signs, "safe" if normal.',
    '- risk: 0-100.',
    `- scamType: one of ${SCAM_TYPES.join(', ')}. Use "none" when safe.`,
    '- summary: one plain sentence a non-technical person understands.',
    '- redFlags: up to 4. quote = short exact words copied from the message; why = one short sentence.',
    '- advice: 2-3 short, practical steps (e.g. "Check your bank app, not the SMS").',
    '- Do not invent details that are not in the message.',
    redacted
      ? '- Personal details were replaced with placeholders like [PHONE_1] or [ACCOUNT_NUMBER_1]. Treat them as real values; asking for them is still a red flag.'
      : '',
    '',
    'MESSAGE:',
    '"""',
    message,
    '"""',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export function namesPrompt(message: string): string {
  return [
    'List every personal name of a real person (first or last names) that appears in the MESSAGE.',
    'Do not include company, bank or brand names. Return an empty list if there are none.',
    '',
    'MESSAGE:',
    '"""',
    message,
    '"""',
  ].join('\n');
}

export const LANGUAGES = {
  ha: 'Hausa',
  yo: 'Yorùbá',
  ig: 'Igbo',
  pcm: 'Nigerian Pidgin',
  en: 'simple English',
} as const;
export type LanguageCode = keyof typeof LANGUAGES;

export function explainPrompt(summary: string, flags: string[], advice: string[], language: LanguageCode): string {
  return [
    `Explain this scam warning to an ordinary person in ${LANGUAGES[language]}.`,
    'Use short sentences and everyday words. Keep it under 120 words. No markdown headings.',
    '',
    `Finding: ${summary}`,
    `Warning signs: ${flags.join('; ')}`,
    `What to do: ${advice.join('; ')}`,
  ].join('\n');
}

/** JSON Schema used for structured output both on-device (responseConstraint) and in the cloud (responseJsonSchema). */
export const CHECK_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['scam', 'suspicious', 'safe'] },
    risk: { type: 'integer', minimum: 0, maximum: 100 },
    scamType: { type: 'string', enum: [...SCAM_TYPES] },
    summary: { type: 'string' },
    redFlags: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        properties: { quote: { type: 'string' }, why: { type: 'string' } },
        required: ['quote', 'why'],
      },
    },
    advice: { type: 'array', maxItems: 3, items: { type: 'string' } },
  },
  required: ['verdict', 'risk', 'scamType', 'summary', 'redFlags', 'advice'],
} as const;

export const NAMES_SCHEMA = {
  type: 'object',
  properties: { names: { type: 'array', items: { type: 'string' } } },
  required: ['names'],
} as const;
