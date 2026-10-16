import { browser } from "wxt/browser";
import { storage } from "wxt/utils/storage";
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

export type Unimported = { faceit: number; valve: number };

// The last count, split by source, for the toolbar popup to show without
// waiting on a fresh one.
export const unimportedCounts = storage.defineItem<Unimported | null>(
  "local:unimported",
  { fallback: null },
);

export async function showUnimported(counts: Unimported | null) {
  const total = counts ? counts.faceit + counts.valve : 0;
  await Promise.all([
    unimportedCounts.setValue(counts),
    browser.action.setBadgeText({
      text: !total ? "" : total >= 100 ? "100+" : String(total),
    }),
  ]);
}

export function unimported(
  candidates: Array<Candidate>,
  lookups: Record<string, Lookup>,
  imports: { faceit: boolean; valve: boolean },
): Unimported {
  const counts: Unimported = { faceit: 0, valve: 0 };
  for (const candidate of candidates) {
    if (
      imports[candidate.source] &&
      (lookups[candidate.key]?.state ?? "none") === "none"
    ) {
      counts[candidate.source]++;
    }
  }
  return counts;
}

async function countUnimported(): Promise<Unimported | null> {
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
  await showUnimported(await countUnimported().catch(() => null));
}
