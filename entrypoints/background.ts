import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { REFRESH_BADGE, refreshBadge } from "@/lib/badge";
import { DEFAULT_PANEL, originPermission, savedPanels } from "@/lib/panel";

const SUPPORTED = /^https:\/\/(www\.)?(faceit|leetify)\.com\//;
const BADGE_INTERVAL_MS = 2 * 60 * 1000;

// The side panel belongs to the FACEIT or Leetify tab it was opened on: Chrome
// hides it on every other tab and brings it back, list and all, on return.
// Anywhere else the toolbar icon opens a popup saying where it works.
export default defineBackground(() => {
  const supportedTabs = new Map<number, boolean>();
  let badgeCheckedAt = 0;

  // Opening FACEIT or Leetify recounts the player's unimported matches, at
  // most every couple of minutes; an import recounts at once.
  function recount(force = false) {
    if (!force && Date.now() - badgeCheckedAt < BADGE_INTERVAL_MS) {
      return;
    }
    badgeCheckedAt = Date.now();
    void refreshBadge();
  }

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

  void browser.action.setBadgeBackgroundColor({ color: "#f7a234" });
  void browser.action.setBadgeTextColor({ color: "#1a1a1a" });

  browser.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.url !== undefined || change.status === "loading") {
      void sync(tabId, tab.url);
    }
    if (change.status === "complete" && tab.url && SUPPORTED.test(tab.url)) {
      recount();
    }
  });
  browser.tabs.onActivated.addListener(({ tabId }) => {
    if (supportedTabs.get(tabId)) {
      recount();
    }
  });
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (message === REFRESH_BADGE) {
      recount(true);
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
  recount(true);

  // Self-hosted panels get the same installed marker as 5stack.gg, for each
  // one the player has granted access to.
  async function markPanels(panels: Array<string>) {
    const origins: Array<string> = [];
    for (const origin of panels.filter((panel) => panel !== DEFAULT_PANEL)) {
      const pattern = originPermission(origin);
      if (await browser.permissions.contains({ origins: [pattern] })) {
        origins.push(pattern);
      }
    }
    await browser.scripting
      .unregisterContentScripts({ ids: ["panel-marker"] })
      .catch(() => undefined);
    if (origins.length > 0) {
      await browser.scripting.registerContentScripts([
        {
          id: "panel-marker",
          matches: origins,
          js: ["content-scripts/panel-marker.js"],
          runAt: "document_start",
        },
      ]);
    }
  }

  void savedPanels.getValue().then(markPanels);
  savedPanels.watch((panels) => void markPanels(panels));
});
