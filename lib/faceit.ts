import { type Candidate, faceitCandidate } from "./candidates";

export type FaceitResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; noCheck?: boolean };

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
      error: "FACEIT changed its page. Update the 5Stack extension.",
    };
  }

  if (!page.turnstile) {
    return {
      ok: false,
      noCheck: true,
      error: "FACEIT's check is not on this page. Open the match on FACEIT.",
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

type FaceitTeam = { name?: string };

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

export type FaceitHistoryRow = {
  matchId?: string;
  date?: number;
  i1?: string;
  i18?: string;
  gameMode?: string;
  matchRound?: string;
};

export function roomCandidate(
  payload: FaceitRoomPayload | undefined,
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
  return faceitCandidate({
    id: payload.id.toLowerCase(),
    maps: demos.length,
    mapNames: payload.voting?.map?.pick ?? [],
    finishedAt: payload.finishedAt ?? null,
    score,
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
    return faceitCandidate({
      id,
      maps: ordered.length,
      mapNames: ordered.map((map) => map.i1 ?? "").filter(Boolean),
      finishedAt: finished > 0 ? new Date(finished).toISOString() : null,
      score: only?.i18 ? only.i18.replace(/\s*\/\s*/, " : ") : null,
      title: null,
    });
  });
}
