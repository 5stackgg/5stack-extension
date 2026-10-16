import { describe, expect, it } from "vitest";
import { historyCandidates, roomCandidate } from "../lib/faceit";

const ROOM = "1-c0d53305-38d8-4d84-9f40-cd0a6032e5bd";
const RESOURCE = `https://demos-europe-central.backblaze.faceit-cdn.net/cs2/${ROOM}-1-1.dem.zst`;

describe("roomCandidate", () => {
  it("offers a finished room's demos", () => {
    expect(
      roomCandidate({
        id: ROOM,
        state: "FINISHED",
        finishedAt: "2026-10-05T23:17:49Z",
        demoURLs: [RESOURCE],
        teams: {
          faction1: { name: "team_a", roster: [{ gameId: "76561198000000001" }] },
          faction2: { name: "team_b", roster: [{ gameId: "76561198000000002" }] },
        },
        voting: { map: { pick: ["de_ancient"] } },
        results: [
          {
            winner: "faction1",
            factions: { faction1: { score: 13 }, faction2: { score: 8 } },
          },
        ],
      }, "76561198000000002"),
    ).toEqual({
      own: true,
      key: `faceit:${ROOM}`,
      source: "faceit",
      id: ROOM,
      maps: 1,
      mapNames: ["de_ancient"],
      finishedAt: "2026-10-05T23:17:49Z",
      score: "13 : 8",
      title: "team_a vs team_b",
    });
  });

  it("scores a series by maps won", () => {
    const candidate = roomCandidate({
      id: ROOM,
      state: "FINISHED",
      demoURLs: [RESOURCE, RESOURCE, RESOURCE],
      results: [
        { winner: "faction1" },
        { winner: "faction2" },
        { winner: "faction1" },
      ],
    }, "76561198000000009");
    expect(candidate).toMatchObject({ maps: 3, score: "2 : 1", own: false });
  });

  it.each([
    ["an ongoing room", { id: ROOM, state: "ONGOING", demoURLs: [RESOURCE] }],
    ["a room without demos yet", { id: ROOM, state: "FINISHED", demoURLs: [] }],
    ["nothing", undefined],
  ])("offers nothing for %s", (_, payload) => {
    expect(roomCandidate(payload, "76561198000000001")).toBeNull();
  });
});

describe("historyCandidates", () => {
  it("folds a series' per-map rows into one match and drops wingman and bad ids", () => {
    const candidates = historyCandidates([
      {
        matchId: "1-aaaaaaaa-0000-0000-0000-000000000000",
        date: 1791851368000,
        i1: "de_dust2",
        i18: "11 / 13",
        gameMode: "5v5",
        matchRound: "1",
      },
      {
        matchId: "1-bbbbbbbb-0000-0000-0000-000000000000",
        date: 1791840000000,
        i1: "de_nuke",
        gameMode: "5v5",
        matchRound: "2",
      },
      {
        matchId: "1-bbbbbbbb-0000-0000-0000-000000000000",
        date: 1791830000000,
        i1: "de_inferno",
        gameMode: "5v5",
        matchRound: "1",
      },
      {
        matchId: "1-cccccccc-0000-0000-0000-000000000000",
        date: 1791820000000,
        i1: "de_vertigo",
        gameMode: "2v2",
        matchRound: "1",
      },
      {
        matchId: "not-a-room-id",
        date: 1791810000000,
        i1: "de_train",
        gameMode: "5v5",
        matchRound: "1",
      },
    ], true);

    expect(candidates).toEqual([
      expect.objectContaining({
        id: "1-aaaaaaaa-0000-0000-0000-000000000000",
        maps: 1,
        mapNames: ["de_dust2"],
        score: "11 : 13",
      }),
      expect.objectContaining({
        id: "1-bbbbbbbb-0000-0000-0000-000000000000",
        maps: 2,
        mapNames: ["de_inferno", "de_nuke"],
        score: null,
        finishedAt: new Date(1791840000000).toISOString(),
      }),
    ]);
  });
});
