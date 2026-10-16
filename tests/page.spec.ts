import { describe, expect, it } from "vitest";
import { pageFromUrl } from "../lib/page";

const ROOM = "1-c0d53305-38d8-4d84-9f40-cd0a6032e5bd";

describe("pageFromUrl", () => {
  it.each([
    [`https://www.faceit.com/en/cs2/room/${ROOM}`, ROOM],
    [`https://www.faceit.com/en/cs2/room/${ROOM}/scoreboard`, ROOM],
    [`https://www.faceit.com/pt-br/cs2/room/${ROOM.toUpperCase()}`, ROOM],
    [`https://www.faceit.com/cs2/room/${ROOM}?tab=stats`, ROOM],
  ])("reads the FACEIT room from %s", (url, matchId) => {
    expect(pageFromUrl(url)).toEqual({ site: "faceit", kind: "room", matchId });
  });

  it.each([
    "https://www.faceit.com/en/players/s1mplecsgod",
    "https://www.faceit.com/en/players/s1mplecsgod/cs2",
    "https://www.faceit.com/en/players/s1mplecsgod/stats/cs2",
    "https://www.faceit.com/en/players/s1mplecsgod/cs2/history",
  ])("reads the FACEIT player from %s", (url) => {
    expect(pageFromUrl(url)).toEqual({
      site: "faceit",
      kind: "player",
      nickname: "s1mplecsgod",
    });
  });

  it("reads a Leetify profile and match", () => {
    expect(
      pageFromUrl("https://leetify.com/app/profile/76561198034202275"),
    ).toEqual({ site: "leetify", kind: "profile", steamId: "76561198034202275" });
    expect(
      pageFromUrl(
        "https://leetify.com/app/match-details/42cd8efe-4521-49f4-92cc-23a525c5b11a/overview",
      ),
    ).toEqual({
      site: "leetify",
      kind: "match",
      gameId: "42cd8efe-4521-49f4-92cc-23a525c5b11a",
    });
  });

  it.each([
    ["https://www.faceit.com/en/home", "faceit"],
    ["https://www.faceit.com/en/cs2/leaderboards", "faceit"],
    ["https://leetify.com/app", "leetify"],
    ["https://leetify.com/app/profile/notasteamid", "leetify"],
  ])("treats %s as the player's own matches", (url, site) => {
    expect(pageFromUrl(url)).toEqual({ site, kind: "home" });
  });

  it.each([
    undefined,
    "chrome://newtab/",
    "https://evil.example/en/cs2/room/" + ROOM,
    "https://faceit.com.evil.example/en/home",
  ])("ignores %s", (url) => {
    expect(pageFromUrl(url)).toEqual({ site: "none" });
  });
});
