import '../ui/styles.css';
import './web.css';
import { mountApp } from '../ui/app';
import { icon } from '../ui/icons';

for (const el of document.querySelectorAll<HTMLElement>('[data-icon="shield"]')) el.append(icon('shield'));

// Browser storage can be unavailable (private mode, blocked site data): never let it break the app.
const prefs = {
  async getPref(key: string) {
    try {
      return localStorage.getItem(`scam-shield:${key}`) === '1';
    } catch {
      return false;
    }
  },
  async setPref(key: string, value: boolean) {
    try {
      localStorage.setItem(`scam-shield:${key}`, value ? '1' : '0');
    } catch {
      /* ignore */
    }
  },
};

mountApp(document.getElementById('app')!, prefs);
