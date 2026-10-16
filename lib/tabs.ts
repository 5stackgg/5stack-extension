import { browser } from "wxt/browser";

const LOAD_TIMEOUT_MS = 30_000;

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
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onRemoved);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const onUpdated = (id: number, change: { status?: string }) => {
      if (id === tabId && change.status === "complete") {
        finish();
      }
    };
    const onRemoved = (id: number) => {
      if (id === tabId) {
        finish(new Error("The FACEIT tab was closed."));
      }
    };
    const timer = setTimeout(
      () => finish(new Error("FACEIT took too long to load.")),
      LOAD_TIMEOUT_MS,
    );
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(onRemoved);
    void browser.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === "complete") {
          finish();
        }
      })
      .catch(() => finish(new Error("The FACEIT tab was closed.")));
  });
}

export async function openFaceitRoom(matchId: string): Promise<number> {
  const tab = await browser.tabs.create({
    url: `https://www.faceit.com/en/cs2/room/${matchId}`,
    active: false,
  });
  if (!tab.id) {
    throw new Error("Could not open FACEIT.");
  }
  await loaded(tab.id);
  return tab.id;
}

// Signing needs FACEIT's page and the user's FACEIT login, but not the match's
// own room: any faceit.com tab with FACEIT's check loaded can sign any match.
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
  return { tabId: await openFaceitRoom(matchId), opened: true };
}

export async function closeTab(tabId: number) {
  await browser.tabs.remove(tabId).catch(() => undefined);
}

export async function showTab(tabId: number) {
  await browser.tabs.update(tabId, { active: true }).catch(() => undefined);
}
