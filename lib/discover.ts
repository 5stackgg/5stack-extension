import type { Candidate } from "./candidates";
import {
  type FaceitHistoryRow,
  type FaceitRoomPayload,
  faceitGet,
  faceitSign,
  historyCandidates,
  roomCandidate,
} from "./faceit";
import { leetifyMatchCandidates, leetifyProfileCandidates } from "./leetify";
import type { Page } from "./page";
import { panel } from "./panel";
import { faceitTab, inTab } from "./tabs";

async function faceit<T>(tabId: number, path: string): Promise<T> {
  const result = await inTab(tabId, faceitGet, [path]);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value as T;
}

export async function discover(
  page: Page,
  tabId: number | undefined,
): Promise<Array<Candidate>> {
  if (page.site === "faceit" && tabId !== undefined) {
    if (page.kind === "room") {
      const room = await faceit<{ payload?: FaceitRoomPayload }>(
        tabId,
        `/api/match/v2/match/${page.matchId}`,
      );
      const candidate = roomCandidate(room.payload);
      return candidate ? [candidate] : [];
    }

    const user = await faceit<{ payload?: { id?: string } }>(
      tabId,
      `/api/users/v1/nicknames/${encodeURIComponent(page.nickname)}`,
    );
    if (!user.payload?.id) {
      return [];
    }
    const rows = await faceit<Array<FaceitHistoryRow>>(
      tabId,
      `/api/stats/v1/stats/time/users/${user.payload.id}/games/cs2?page=0&size=20`,
    );
    return historyCandidates(Array.isArray(rows) ? rows : []);
  }

  if (page.site === "leetify") {
    return page.kind === "profile"
      ? leetifyProfileCandidates(page.steamId)
      : leetifyMatchCandidates(page.gameId);
  }

  return [];
}

export async function importFaceitMatch(
  origin: string,
  matchId: string,
  onStep: (map: number, maps: number) => void,
): Promise<number> {
  const { tabId } = await faceitTab(matchId);
  const room = await faceit<{ payload?: FaceitRoomPayload }>(
    tabId,
    `/api/match/v2/match/${matchId}`,
  );
  const demos = (room.payload?.demoURLs ?? []).filter(Boolean);
  if (room.payload?.state !== "FINISHED" || demos.length === 0) {
    throw new Error("FACEIT has no demo for this match yet.");
  }

  for (const [index, resourceUrl] of demos.entries()) {
    onStep(index + 1, demos.length);
    const signed = await inTab(tabId, faceitSign, [resourceUrl]);
    if (!signed.ok) {
      throw new Error(signed.error);
    }
    await panel.importFaceit(origin, {
      match_id: matchId,
      map: index + 1,
      url: signed.value,
    });
  }
  return demos.length;
}
