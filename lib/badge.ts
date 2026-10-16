import { browser } from "wxt/browser";
import type { Candidate } from "./candidates";
import { faceitHistory, ownFaceitId } from "./discover";
import { leetifyProfileCandidates } from "./leetify";
import { panel, panelOrigin } from "./panel";

const LOOKUP_BATCH = 50;

export const REFRESH_BADGE = "refresh-badge";

// The signed-in player's own matches that are not in their panel yet: their
// Leetify list, which carries both Valve and FACEIT matches, plus their FACEIT
// history when a FACEIT tab is open to read it from.
async function countUnimported(): Promise<number | null> {
  const origin = await panelOrigin.getValue();
  const user = await panel.me(origin).catch(() => null);
  if (!user) {
    return null;
  }

  const found = new Map<string, Candidate>();
  const leetify = await leetifyProfileCandidates(
    user.steam_id,
    user.steam_id,
  ).catch((): Array<Candidate> => []);
  for (const candidate of leetify) {
    found.set(candidate.key, candidate);
  }

  const [faceitTab] = await browser.tabs.query({
    url: "https://www.faceit.com/*",
    status: "complete",
  });
  if (faceitTab?.id !== undefined) {
    const playerId = await ownFaceitId(faceitTab.id, user).catch(() => null);
    const history = playerId
      ? await faceitHistory(faceitTab.id, playerId, true).catch(
          (): Array<Candidate> => [],
        )
      : [];
    for (const candidate of history) {
      found.set(candidate.key, candidate);
    }
  }

  const importable = [...found.values()].filter(
    (candidate) => user.imports[candidate.source],
  );
  let count = 0;
  for (let offset = 0; offset < importable.length; offset += LOOKUP_BATCH) {
    const batch = importable.slice(offset, offset + LOOKUP_BATCH);
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
      if ((lookup?.state ?? "none") === "none") {
        count++;
      }
    }
  }
  return count;
}

export async function refreshBadge() {
  const count = await countUnimported().catch(() => null);
  await browser.action.setBadgeText({
    text: !count ? "" : count >= 100 ? "100+" : String(count),
  });
}
