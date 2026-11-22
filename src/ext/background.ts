import { PENDING_KEY } from './shared';

const MENU_SELECTION = 'scam-shield-selection';
const MENU_PAGE = 'scam-shield-page';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_SELECTION, title: 'Check with Scam Shield', contexts: ['selection'] });
  chrome.contextMenus.create({ id: MENU_PAGE, title: 'Check this page with Scam Shield', contexts: ['page'] });
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  // Open the panel first, synchronously inside the user gesture.
  void chrome.sidePanel.open({ tabId: tab.id });
  if (info.menuItemId === MENU_SELECTION && info.selectionText) {
    void chrome.storage.session.set({ [PENDING_KEY]: info.selectionText });
  } else if (info.menuItemId === MENU_PAGE) {
    void chrome.scripting
      .executeScript({ target: { tabId: tab.id }, func: () => (document.body.innerText || '').slice(0, 12000) })
      .then(([res]) => chrome.storage.session.set({ [PENDING_KEY]: String(res?.result ?? '') }));
  }
});
