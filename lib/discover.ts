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
import { panel, type PanelUser } from "./panel";
import { closeTab, faceitTab, inTab, openFaceitRoom, showTab } from "./tabs";

async function faceit<T>(tabId: number, path: string): Promise<T> {
  const result = await inTab(tabId, faceitGet, [path]);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value as T;
}

export async function faceitHistory(
  tabId: number,
  playerId: string,
  own: boolean,
): Promise<Array<Candidate>> {
  const rows = await faceit<Array<FaceitHistoryRow>>(
    tabId,
    `/api/stats/v1/stats/time/users/${playerId}/games/cs2?page=0&size=20`,
  );
  return historyCandidates(Array.isArray(rows) ? rows : [], own);
}

// Off a match or player page, the list is the signed-in player's own: their
// FACEIT account as 5Stack knows it, else whoever is logged in to FACEIT.
export async function ownFaceitId(tabId: number, user: PanelUser) {
  if (user.faceit?.player_id) {
    return user.faceit.player_id;
  }
  const session = await faceit<{ payload?: { id?: string; guid?: string } }>(
    tabId,
    "/api/users/v1/sessions/me",
  ).catch(() => null);
  return session?.payload?.id ?? session?.payload?.guid ?? null;
}

export async function discover(
  page: Page,
  tabId: number | undefined,
  user: PanelUser,
): Promise<Array<Candidate>> {
  if (page.site === "faceit" && tabId !== undefined) {
    if (page.kind === "room") {
      const room = await faceit<{ payload?: FaceitRoomPayload }>(
        tabId,
        `/api/match/v2/match/${page.matchId}`,
      );
      const candidate = roomCandidate(room.payload, user.steam_id);
      return candidate ? [candidate] : [];
    }

    if (page.kind === "home") {
      const playerId = await ownFaceitId(tabId, user);
      return playerId ? faceitHistory(tabId, playerId, true) : [];
    }

    const found = await faceit<{
      payload?: { id?: string; games?: { cs2?: { game_player_id?: string } } };
    }>(tabId, `/api/users/v1/nicknames/${encodeURIComponent(page.nickname)}`);
    const own = found.payload?.games?.cs2?.game_player_id === user.steam_id;
    return found.payload?.id
      ? faceitHistory(tabId, found.payload.id, own)
      : [];
  }

  if (page.site === "leetify") {
    if (page.kind === "home") {
      return leetifyProfileCandidates(user.steam_id, user.steam_id);
    }
    return page.kind === "profile"
      ? leetifyProfileCandidates(page.steamId, user.steam_id)
      : leetifyMatchCandidates(page.gameId, user.steam_id);
  }

  return [];
}

// A tab opened for the import is closed once it worked, and brought forward
// when it did not, since FACEIT's check may be waiting there for a click.
export async function importFaceitMatch(
  origin: string,
  matchId: string,
  onStep: (map: number, maps: number) => void,
): Promise<number> {
  let { tabId, opened } = await faceitTab(matchId);
  try {
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
      let signed = await inTab(tabId, faceitSign, [resourceUrl]);
      if (!signed.ok && signed.noCheck && !opened) {
        tabId = await openFaceitRoom(matchId);
        opened = true;
        signed = await inTab(tabId, faceitSign, [resourceUrl]);
      }
      if (!signed.ok) {
        throw new Error(signed.error);
      }
      await panel.importFaceit(origin, { match_id: matchId, url: signed.value });
    }

    if (opened) {
      await closeTab(tabId);
    }
    return demos.length;
  } catch (error) {
    if (opened) {
      await showTab(tabId);
    }
    throw error;
  }
}
