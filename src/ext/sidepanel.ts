import { mountApp } from '../ui/app';
import { PENDING_KEY } from './shared';

const app = mountApp(document.getElementById('app')!, {
  async readPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('no tab');
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const sel = String(window.getSelection() ?? '').trim();
        return (sel || document.body.innerText || '').slice(0, 12000);
      },
    });
    return String(res?.result ?? '');
  },
  async getPref(key) {
    return Boolean((await chrome.storage.local.get(key))[key]);
  },
  async setPref(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
});

// Text sent from the right-click menu.
async function takePending(): Promise<void> {
  const { [PENDING_KEY]: pending } = await chrome.storage.session.get(PENDING_KEY);
  if (typeof pending === 'string' && pending.trim()) {
    await chrome.storage.session.remove(PENDING_KEY);
    app.checkText(pending);
  }
}
void takePending();
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes[PENDING_KEY]?.newValue) void takePending();
});
