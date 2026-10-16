import {
  type Candidate,
  type MatchStats,
  faceitCandidate,
  number,
  ownScore,
  valveCandidate,
} from "./candidates";

const API = "https://api-public.cs-prod.leetify.com";
const SHARE_CODE = /^CSGO(?:-[A-Za-z0-9]{5}){5}$/;
const FACEIT_MATCH_ID =
  /^1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MATCHES = 40;

export type LeetifyMatch = {
  id: string;
  finished_at?: string;
  data_source?: string;
  data_source_match_id?: string;
  map_name?: string;
  team_scores?: Array<{ team_number: number; score: number }>;
  stats?: Array<{
    steam64_id?: string;
    total_kills?: number;
    total_deaths?: number;
    total_assists?: number;
    total_hs_kills?: number;
    dpr?: number;
    leetify_rating?: number;
    rounds_won?: number;
    rounds_lost?: number;
  }>;
};

// The profile's own line in a match: Leetify lists only the owner's stats on a
// profile's match list.
function ownLine(match: LeetifyMatch, steamId?: string) {
  const line = steamId
    ? match.stats?.find((stat) => stat.steam64_id === steamId)
    : match.stats?.[0];
  if (!line) {
    return { result: undefined, stats: undefined, score: undefined };
  }
  const won = number(line.rounds_won);
  const lost = number(line.rounds_lost);
  const result: Candidate["result"] =
    won === undefined || lost === undefined
      ? undefined
      : won > lost
        ? "win"
        : won < lost
          ? "loss"
          : "tie";
  const kills = number(line.total_kills);
  const headshots = number(line.total_hs_kills);
  const rating = number(line.leetify_rating);
  const stats: MatchStats = {
    kills,
    deaths: number(line.total_deaths),
    assists: number(line.total_assists),
    adr: number(line.dpr),
    headshotPercent:
      kills && headshots !== undefined
        ? Math.round((headshots / kills) * 100)
        : undefined,
    rating: rating === undefined ? undefined : rating * 100,
  };
  return {
    result,
    stats,
    score:
      won === undefined || lost === undefined
        ? undefined
        : ownScore([won, lost], result),
  };
}

export function leetifyCandidate(
  match: LeetifyMatch,
  own: boolean,
  steamId?: string,
): Candidate | null {
  const sourceId = match.data_source_match_id ?? "";
  const line = ownLine(match, steamId);
  const fields = {
    own,
    mapNames: match.map_name ? [match.map_name] : [],
    finishedAt: match.finished_at ?? null,
    score:
      line.score ??
      (match.team_scores?.length === 2
        ? match.team_scores.map((team) => team.score).join(" : ")
        : null),
    title: null,
    result: line.result,
    stats: line.stats,
  };

  if (match.data_source === "faceit" && FACEIT_MATCH_ID.test(sourceId)) {
    return faceitCandidate({ ...fields, id: sourceId.toLowerCase(), maps: 1 });
  }
  if (
    match.data_source?.startsWith("matchmaking") &&
    SHARE_CODE.test(sourceId)
  ) {
    return valveCandidate({ ...fields, id: sourceId });
  }
  return null;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`);
  if (response.status === 404) {
    throw new Error("Leetify has no public matches for this player.");
  }
  if (response.status === 429) {
    throw new Error("Leetify is rate limiting requests. Try again shortly.");
  }
  if (!response.ok) {
    throw new Error(`Leetify answered ${response.status}`);
  }
  return (await response.json()) as T;
}

async function profileMatches(steamId: string): Promise<Array<LeetifyMatch>> {
  return get<Array<LeetifyMatch>>(
    `/v3/profile/matches?steam64_id=${encodeURIComponent(steamId)}`,
  );
}

export async function leetifyProfileCandidates(
  steamId: string,
  viewer: string,
): Promise<Array<Candidate>> {
  const candidates = (await profileMatches(steamId))
    .map((match) => leetifyCandidate(match, steamId === viewer, steamId))
    .filter((candidate): candidate is Candidate => candidate !== null);
  return candidates.slice(0, MAX_MATCHES);
}

// A match's own page does not carry its FACEIT id or share code, but every
// player's match list does, so find it in one of theirs.
export async function leetifyMatchCandidates(
  gameId: string,
  viewer: string,
): Promise<Array<Candidate>> {
  const match = await get<LeetifyMatch>(
    `/v2/matches/${encodeURIComponent(gameId)}`,
  );
  const everyone = (match.stats ?? [])
    .map((stat) => stat.steam64_id)
    .filter((id): id is string => !!id);
  const played = everyone.includes(viewer);
  const players = played ? [viewer] : everyone.slice(0, 3);

  for (const steamId of players) {
    const listed = (await profileMatches(steamId).catch(() => [])).find(
      (candidate) => candidate.id === gameId,
    );
    if (listed) {
      const candidate = leetifyCandidate(listed, played, steamId);
      return candidate ? [candidate] : [];
    }
  }
  return [];
}
