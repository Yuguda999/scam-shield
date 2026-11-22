import { initializeApp, type FirebaseApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { fetchAndActivate, getNumber, getRemoteConfig, getString, type RemoteConfig } from 'firebase/remote-config';
import { firebaseConfig } from './config';
import { DEFAULT_PATTERNS } from '../core/prompts';

declare global {
  // Read by the App Check SDK; enables debug-token mode.
  // eslint-disable-next-line no-var
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean | undefined;
}

export interface AppSettings {
  cloudModel: string;
  maxDeviceChars: number;
  patterns: string[];
}

const DEFAULTS = {
  cloud_model: 'gemini-3.5-flash-lite',
  max_device_chars: 6000,
  scam_patterns: JSON.stringify(DEFAULT_PATTERNS),
};

let app: FirebaseApp | undefined;
let ai: AI | undefined;
let rc: RemoteConfig | undefined;

export function firebase(): { app: FirebaseApp; ai: AI } {
  if (!app) {
    // Chrome extensions cannot load reCAPTCHA (MV3 forbids remote code), so the
    // extension uses an App Check debug token registered in the Firebase console.
    // The hosted web build can swap in ReCaptchaEnterpriseProvider instead.
    const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined;
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken || true;
    app = initializeApp(firebaseConfig);
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: () => Promise.reject(new Error('App Check runs in debug-token mode in this build.')),
      }),
      isTokenAutoRefreshEnabled: true,
    });
    ai = getAI(app, { backend: new GoogleAIBackend() });
  }
  return { app, ai: ai! };
}

/** Remote Config lets us push new scam patterns, limits and model names without a new release. */
export async function loadSettings(): Promise<AppSettings> {
  const { app } = firebase();
  try {
    if (!rc) {
      rc = getRemoteConfig(app);
      rc.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
      rc.defaultConfig = DEFAULTS;
    }
    await fetchAndActivate(rc).catch(() => false); // offline is fine: defaults / last fetched values apply
    let patterns: string[] = DEFAULT_PATTERNS;
    try {
      const parsed = JSON.parse(getString(rc, 'scam_patterns'));
      if (Array.isArray(parsed) && parsed.every((p) => typeof p === 'string') && parsed.length) patterns = parsed;
    } catch {
      /* keep defaults */
    }
    return {
      cloudModel: getString(rc, 'cloud_model') || DEFAULTS.cloud_model,
      maxDeviceChars: getNumber(rc, 'max_device_chars') || DEFAULTS.max_device_chars,
      patterns,
    };
  } catch {
    return { cloudModel: DEFAULTS.cloud_model, maxDeviceChars: DEFAULTS.max_device_chars, patterns: DEFAULT_PATTERNS };
  }
}
