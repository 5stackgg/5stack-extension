import { browser } from "wxt/browser";

export async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export async function inTab<Args extends Array<unknown>, Result>(
  tabId: number,
  func: (...args: Args) => Promise<Result>,
  args: Args,
): Promise<Result> {
  const [injection] = await browser.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func,
    args,
  });
  if (!injection) {
    throw new Error("Could not run on the FACEIT tab.");
  }
  return injection.result as Result;
}

function loaded(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (
      id: number,
      change: { status?: string },
    ) => {
      if (id === tabId && change.status === "complete") {
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

// Signing needs FACEIT's page and the user's FACEIT login, but not the match's
// own room: any faceit.com tab can sign any match.
export async function faceitTab(
  matchId: string,
): Promise<{ tabId: number; opened: boolean }> {
  const current = await activeTab();
  if (current?.id && current.url?.startsWith("https://www.faceit.com/")) {
    return { tabId: current.id, opened: false };
  }
  const [existing] = await browser.tabs.query({
    url: "https://www.faceit.com/*",
    status: "complete",
  });
  if (existing?.id) {
    return { tabId: existing.id, opened: false };
  }
  const tab = await browser.tabs.create({
    url: `https://www.faceit.com/en/cs2/room/${matchId}`,
    active: false,
  });
  if (!tab.id) {
    throw new Error("Could not open FACEIT.");
  }
  await loaded(tab.id);
  return { tabId: tab.id, opened: true };
}
