import {
  type Candidate,
  type MatchStats,
  faceitCandidate,
  number,
  ownScore,
} from "./candidates";

export type FaceitResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// faceitGet and faceitSign are handed to chrome.scripting.executeScript and run
// inside a faceit.com tab, so each must stand alone: nothing from this module's
// scope survives the trip, only the function's own source.

export async function faceitGet(path: string): Promise<FaceitResult<unknown>> {
  if (!path.startsWith("/api/")) {
    return { ok: false, error: "not a FACEIT api path" };
  }
  try {
    const response = await fetch(path, { credentials: "include" });
    if (!response.ok) {
      return { ok: false, error: `FACEIT answered ${response.status}` };
    }
    return { ok: true, value: await response.json() };
  } catch (error) {
    return { ok: false, error: `could not reach FACEIT: ${String(error)}` };
  }
}

export async function faceitSign(
  resourceUrl: string,
): Promise<FaceitResult<string>> {
  const page = window as unknown as {
    faceitRuntime?: { APP_TURNSTILE_SITEKEY?: string };
    turnstile?: {
      render: (element: HTMLElement, options: object) => string;
      remove: (widgetId: string) => void;
    };
  };

  const sitekey = page.faceitRuntime?.APP_TURNSTILE_SITEKEY;
  if (!sitekey) {
    return {
      ok: false,
      error: "FACEIT changed its page. Update 5Stack Match Importer.",
    };
  }

  // FACEIT loads its Turnstile check lazily and not on every page. Give it a
  // moment, then load Cloudflare's script, the one FACEIT itself uses, so any
  // FACEIT page can sign a demo.
  for (let waited = 0; !page.turnstile && waited < 5000; waited += 250) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!page.turnstile) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    } catch {
      return {
        ok: false,
        error: "Could not load FACEIT's check. Reload the FACEIT tab and try again.",
      };
    }
  }
  if (!page.turnstile) {
    return {
      ok: false,
      error: "Could not load FACEIT's check. Reload the FACEIT tab and try again.",
    };
  }

  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
  document.body.appendChild(host);
  let widgetId: string | null = null;

  try {
    const token = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              "FACEIT's check did not finish. If it asks for a click, complete it on the FACEIT tab.",
            ),
          ),
        90_000,
      );
      widgetId = page.turnstile!.render(host, {
        sitekey,
        action: "matchroomFinished_downloadDemos",
        callback: (value: string) => {
          clearTimeout(timer);
          resolve(value);
        },
        "error-callback": (code: string) => {
          clearTimeout(timer);
          reject(new Error(`FACEIT's check failed (${code})`));
        },
      });
    });

    const response = await fetch("/api/download/v2/demos/download-url", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resource_url: resourceUrl, captcha_token: token }),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "Log in to FACEIT to import its demos." };
    }
    const body = (await response.json().catch(() => null)) as {
      payload?: { download_url?: unknown };
    } | null;
    const url = body?.payload?.download_url;
    if (!response.ok || typeof url !== "string") {
      return {
        ok: false,
        error: `FACEIT would not sign the demo (${response.status})`,
      };
    }
    return { ok: true, value: url };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  } finally {
    if (widgetId !== null) {
      page.turnstile?.remove(widgetId);
    }
    host.remove();
  }
}

const MATCH_ID =
  /^1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FaceitTeam = { name?: string; roster?: Array<{ gameId?: string }> };

function rounds(score: string | undefined): [number, number] | null {
  const parts = (score ?? "").split(/\s*[\/:]\s*/).map(Number);
  return parts.length === 2 && parts.every(Number.isFinite)
    ? [parts[0]!, parts[1]!]
    : null;
}

export type FaceitRoomPayload = {
  id?: string;
  state?: string;
  finishedAt?: string;
  demoURLs?: Array<string>;
  teams?: { faction1?: FaceitTeam; faction2?: FaceitTeam };
  voting?: { map?: { pick?: Array<string> } };
  results?: Array<{
    factions?: Record<string, { score?: number }>;
    winner?: string;
  }>;
};

// FACEIT's per-map history row for one player. The stat keys are FACEIT's
// own: i6 kills, i7 assists, i8 deaths, i10 won (1), i18 score, c4 headshot
// percent, c10 damage per round.
export type FaceitHistoryRow = {
  matchId?: string;
  date?: number;
  i1?: string;
  i6?: string;
  i7?: string;
  i8?: string;
  i10?: string;
  i18?: string;
  c4?: string;
  c10?: string;
  elo_delta?: string;
  gameMode?: string;
  matchRound?: string;
};

export function roomCandidate(
  payload: FaceitRoomPayload | undefined,
  steamId: string,
): Candidate | null {
  if (!payload?.id || payload.state !== "FINISHED") {
    return null;
  }
  const demos = (payload.demoURLs ?? []).filter(Boolean);
  if (demos.length === 0) {
    return null;
  }

  const results = payload.results ?? [];
  let score: string | null = null;
  if (results.length === 1) {
    const factions = results[0]?.factions ?? {};
    score = `${factions.faction1?.score ?? 0} : ${factions.faction2?.score ?? 0}`;
  } else if (results.length > 1) {
    const won = (faction: string) =>
      results.filter((result) => result.winner === faction).length;
    score = `${won("faction1")} : ${won("faction2")}`;
  }

  const teams = payload.teams;
  const side = (["faction1", "faction2"] as const).find((faction) =>
    teams?.[faction]?.roster?.some((player) => player.gameId === steamId),
  );
  const played = side !== undefined;
  const mapsWon = side
    ? results.filter((result) => result.winner === side).length
    : 0;
  const result: Candidate["result"] =
    !side || results.length === 0
      ? undefined
      : mapsWon * 2 > results.length
        ? "win"
        : mapsWon * 2 < results.length
          ? "loss"
          : "tie";
  const scored = score ? rounds(score) : null;
  return faceitCandidate({
    own: played,
    result,
    id: payload.id.toLowerCase(),
    maps: demos.length,
    mapNames: payload.voting?.map?.pick ?? [],
    finishedAt: payload.finishedAt ?? null,
    score: scored && result ? ownScore(scored, result) : score,
    title:
      teams?.faction1?.name && teams?.faction2?.name
        ? `${teams.faction1.name} vs ${teams.faction2.name}`
        : null,
  });
}

// FACEIT's history has a row per map, so a best of three is three rows under
// one match id.
export function historyCandidates(
  rows: Array<FaceitHistoryRow>,
  own: boolean,
): Array<Candidate> {
  const byMatch = new Map<string, Array<FaceitHistoryRow>>();
  for (const row of rows) {
    if (!row.matchId || !MATCH_ID.test(row.matchId) || row.gameMode !== "5v5") {
      continue;
    }
    const id = row.matchId.toLowerCase();
    byMatch.set(id, [...(byMatch.get(id) ?? []), row]);
  }

  return [...byMatch].map(([id, maps]) => {
    const ordered = [...maps].sort(
      (a, b) => Number(a.matchRound ?? 0) - Number(b.matchRound ?? 0),
    );
    const finished = Math.max(...ordered.map((map) => map.date ?? 0));
    const only = ordered.length === 1 ? ordered[0] : undefined;
    const won = ordered.filter((map) => map.i10 === "1").length;
    const eloDelta = ordered
      .map((map) => number(map.elo_delta))
      .find((delta) => delta !== undefined);
    const result: Candidate["result"] = ordered.some((map) => map.i10 !== undefined)
      ? won * 2 > ordered.length
        ? "win"
        : won * 2 < ordered.length
          ? "loss"
          : "tie"
      : eloDelta === undefined
        ? undefined
        : eloDelta > 0
          ? "win"
          : "loss";
    const sum = (key: "i6" | "i7" | "i8") =>
      ordered.some((map) => number(map[key]) !== undefined)
        ? ordered.reduce((total, map) => total + (number(map[key]) ?? 0), 0)
        : undefined;
    const stats: MatchStats = {
      kills: sum("i6"),
      deaths: sum("i8"),
      assists: sum("i7"),
      adr: only ? number(only.c10) : undefined,
      headshotPercent: only ? number(only.c4) : undefined,
      eloDelta,
    };
    const hasStats = Object.values(stats).some((value) => value !== undefined);
    const scored = rounds(only?.i18);
    return faceitCandidate({
      own,
      id,
      maps: ordered.length,
      mapNames: ordered.map((map) => map.i1 ?? "").filter(Boolean),
      finishedAt: finished > 0 ? new Date(finished).toISOString() : null,
      score: scored ? ownScore(scored, result) : null,
      title: null,
      result,
      stats: hasStats ? stats : undefined,
    });
  });
}
