import type { RouteReason } from './types';

export type DeviceAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'no_api';

export interface RouteInput {
  textLength: number;
  device: DeviceAvailability;
  /** Max characters we send to the on-device model (Remote Config). */
  maxDeviceChars: number;
  deepCheck?: boolean;
}

export interface RouteDecision {
  target: 'on_device' | 'in_cloud';
  /** Cloud requests are always redacted on-device first. */
  redact: boolean;
  reason: RouteReason;
}

/**
 * Privacy-aware routing on top of Firebase AI Logic's hybrid modes.
 *
 * The SDK's PREFER_ON_DEVICE mode silently falls back to the cloud with the
 * original prompt. Scam Shield decides first: raw text may only ever reach the
 * on-device model; anything bound for the cloud is redacted on-device.
 */
export function route(input: RouteInput): RouteDecision {
  if (input.deepCheck) return { target: 'in_cloud', redact: true, reason: 'user_requested_deep_check' };
  if (input.device !== 'available') return { target: 'in_cloud', redact: true, reason: 'no_on_device_model' };
  if (input.textLength > input.maxDeviceChars) return { target: 'in_cloud', redact: true, reason: 'too_long_for_device' };
  return { target: 'on_device', redact: false, reason: 'on_device_available' };
}

export const ROUTE_LABELS: Record<RouteReason, string> = {
  on_device_available: 'Checked privately on this device. Nothing was sent anywhere.',
  no_on_device_model: 'No on-device model here, so a redacted copy was checked in the cloud.',
  too_long_for_device: 'Too long for the on-device model, so a redacted copy was checked in the cloud.',
  user_requested_deep_check: 'You asked for a deep check. Only the redacted copy below was sent.',
  language_needs_cloud: 'This language needs the cloud model.',
};
