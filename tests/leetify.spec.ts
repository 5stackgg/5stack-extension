import { describe, expect, it } from "vitest";
import { leetifyCandidate } from "../lib/leetify";

const base = {
  id: "42cd8efe-4521-49f4-92cc-23a525c5b11a",
  finished_at: "2026-10-13T20:02:53.000Z",
  map_name: "de_dust2",
  team_scores: [
    { team_number: 2, score: 13 },
    { team_number: 3, score: 5 },
  ],
};

describe("leetifyCandidate", () => {
  it("turns a matchmaking match into a share code import", () => {
    expect(
      leetifyCandidate(
        {
          ...base,
          data_source: "matchmaking",
          data_source_match_id: "CSGO-Nacov-KbYev-J2EN9-3XS8v-8rP3A",
        },
        true,
      ),
    ).toEqual({
      own: true,
      key: "valve:CSGO-Nacov-KbYev-J2EN9-3XS8v-8rP3A",
      source: "valve",
      id: "CSGO-Nacov-KbYev-J2EN9-3XS8v-8rP3A",
      maps: 1,
      mapNames: ["de_dust2"],
      finishedAt: "2026-10-13T20:02:53.000Z",
      score: "13 : 5",
      title: null,
    });
  });

  it("turns a FACEIT match into a FACEIT import by its room id", () => {
    expect(
      leetifyCandidate(
        {
          ...base,
          data_source: "faceit",
          data_source_match_id: "1-C0D53305-38d8-4d84-9f40-cd0a6032e5bd",
        },
        false,
      ),
    ).toMatchObject({
      own: false,
      key: "faceit:1-c0d53305-38d8-4d84-9f40-cd0a6032e5bd",
      source: "faceit",
      maps: 1,
    });
  });

  it.each([
    ["hltv", "2399261-mibr-vs-bc-game-m3-inferno.dem"],
    ["esplay", "abc"],
    ["matchmaking", "not-a-share-code"],
    ["faceit", "not-a-room"],
  ])("skips a %s match it cannot import", (data_source, data_source_match_id) => {
    expect(
      leetifyCandidate({ ...base, data_source, data_source_match_id }, true),
    ).toBeNull();
  });
});
