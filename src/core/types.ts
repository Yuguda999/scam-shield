export type Verdict = 'scam' | 'suspicious' | 'safe';

export const SCAM_TYPES = [
  'fake_bank_alert',
  'account_or_bvn_update',
  'otp_or_pin_request',
  'fake_job_offer',
  'investment_or_ponzi',
  'loan_app',
  'prize_or_giveaway',
  'impersonation',
  'romance',
  'delivery_or_customs',
  'phishing_link',
  'other',
  'none',
] as const;
export type ScamType = (typeof SCAM_TYPES)[number];

export interface RedFlag {
  /** Short exact quote from the message that shows the flag. */
  quote: string;
  /** Why it is a warning sign, in plain words. */
  why: string;
}

export interface CheckResult {
  verdict: Verdict;
  /** 0 (safe) to 100 (certain scam). */
  risk: number;
  scamType: ScamType;
  summary: string;
  redFlags: RedFlag[];
  advice: string[];
}

/** Where the answer came from, shown to the user as a badge. */
export type Source = 'on_device' | 'in_cloud';

export interface CheckOutcome {
  result: CheckResult;
  source: Source;
  /** True when the text was redacted before inference (always true for cloud). */
  redacted: boolean;
  /** The exact text the model saw. */
  sentText: string;
  ms: number;
  /** Why the router picked this path, for the "how was this checked?" panel. */
  route: RouteReason;
}

export type RouteReason =
  | 'on_device_available'
  | 'no_on_device_model'
  | 'too_long_for_device'
  | 'user_requested_deep_check'
  | 'language_needs_cloud';

export interface Explanation {
  language: string;
  text: string;
  source: Source;
}
