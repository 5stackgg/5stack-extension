import { browser } from "wxt/browser";
import type { Candidate } from "./candidates";
import { ownMatches } from "./discover";
import { type Lookup, panel, panelOrigin } from "./panel";

const LOOKUP_BATCH = 50;

export const REFRESH_BADGE = "refresh-badge";

export async function anyFaceitTab(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({
    url: "https://www.faceit.com/*",
    status: "complete",
  });
  return tab?.id;
}

export async function setBadgeCount(count: number | null) {
  await browser.action.setBadgeText({
    text: !count ? "" : count >= 100 ? "100+" : String(count),
  });
}

export function unimported(
  candidates: Array<Candidate>,
  lookups: Record<string, Lookup>,
  imports: { faceit: boolean; valve: boolean },
): number {
  return candidates.filter(
    (candidate) =>
      imports[candidate.source] &&
      (lookups[candidate.key]?.state ?? "none") === "none",
  ).length;
}

async function countUnimported(): Promise<number | null> {
  const origin = await panelOrigin.getValue();
  const user = await panel.me(origin).catch(() => null);
  if (!user) {
    return null;
  }
  const candidates = await ownMatches(user, await anyFaceitTab());
  const lookups: Record<string, Lookup> = {};
  for (let offset = 0; offset < candidates.length; offset += LOOKUP_BATCH) {
    const batch = candidates.slice(offset, offset + LOOKUP_BATCH);
    const result = await panel.lookup(origin, {
      faceit: batch
        .filter((c) => c.source === "faceit")
        .map((c) => ({ id: c.id, maps: c.maps })),
      valve: batch.filter((c) => c.source === "valve").map((c) => c.id),
    });
    for (const candidate of batch) {
      const lookup =
        candidate.source === "faceit"
          ? result.faceit[candidate.id]
          : result.valve[candidate.id];
      if (lookup) {
        lookups[candidate.key] = lookup;
      }
    }
  }
  return unimported(candidates, lookups, user.imports);
}

export async function refreshBadge() {
  await setBadgeCount(await countUnimported().catch(() => null));
}
