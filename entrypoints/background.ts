import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

const SUPPORTED = /^https:\/\/(www\.)?(faceit|leetify)\.com\//;

// The side panel belongs to the FACEIT or Leetify tab it was opened on: Chrome
// hides it on every other tab and brings it back, list and all, on return.
// Anywhere else the toolbar icon opens a popup saying where it works.
export default defineBackground(() => {
  const supportedTabs = new Map<number, boolean>();

  async function sync(tabId: number, url: string | undefined) {
    const supported = !!url && SUPPORTED.test(url);
    if (supportedTabs.get(tabId) === supported) {
      return;
    }
    supportedTabs.set(tabId, supported);
    await Promise.all([
      browser.sidePanel.setOptions(
        supported
          ? { tabId, path: `sidepanel.html?tab=${tabId}`, enabled: true }
          : { tabId, enabled: false },
      ),
      browser.action.setPopup({ tabId, popup: supported ? "" : "popup.html" }),
    ]);
  }

  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void browser.sidePanel.setOptions({ enabled: false });

  browser.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.url !== undefined || change.status === "loading") {
      void sync(tabId, tab.url);
    }
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    supportedTabs.delete(tabId);
  });
  void browser.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id !== undefined) {
        void sync(tab.id, tab.url);
      }
    }
  });
});
