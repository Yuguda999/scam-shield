import { describe, expect, it } from 'vitest';
import { route } from './router';

const base = { textLength: 200, device: 'available' as const, maxDeviceChars: 6000 };

describe('route', () => {
  it('keeps raw text on-device when the model is ready', () => {
    expect(route(base)).toEqual({ target: 'on_device', redact: false, reason: 'on_device_available' });
  });

  it.each(['downloadable', 'downloading', 'unavailable', 'no_api'] as const)(
    'goes to the cloud redacted when device is %s',
    (device) => {
      expect(route({ ...base, device })).toMatchObject({ target: 'in_cloud', redact: true });
    },
  );

  it('sends long text to the cloud redacted', () => {
    expect(route({ ...base, textLength: 9000 })).toEqual({
      target: 'in_cloud',
      redact: true,
      reason: 'too_long_for_device',
    });
  });

  it('never sends raw text to the cloud', () => {
    for (const device of ['available', 'unavailable'] as const)
      for (const textLength of [10, 99999])
        for (const deepCheck of [false, true]) {
          const d = route({ ...base, device, textLength, deepCheck });
          if (d.target === 'in_cloud') expect(d.redact).toBe(true);
        }
  });
});
