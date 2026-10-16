export type Page =
  | { site: "faceit"; kind: "room"; matchId: string }
  | { site: "faceit"; kind: "player"; nickname: string }
  | { site: "leetify"; kind: "profile"; steamId: string }
  | { site: "leetify"; kind: "match"; gameId: string }
  | { site: "none" };

const FACEIT_ROOM =
  /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?cs2\/room\/(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;
const FACEIT_PLAYER =
  /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?players\/([^/]+)(?:\/|$)/i;
const LEETIFY_PROFILE = /^\/app\/profile\/(\d{17})(?:\/|$)/;
const LEETIFY_MATCH =
  /^\/app\/match-details\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

export function pageFromUrl(input: string | undefined): Page {
  let url: URL;
  try {
    url = new URL(input ?? "");
  } catch {
    return { site: "none" };
  }

  if (url.hostname === "www.faceit.com" || url.hostname === "faceit.com") {
    const matchId = url.pathname.match(FACEIT_ROOM)?.[1];
    if (matchId) {
      return { site: "faceit", kind: "room", matchId: matchId.toLowerCase() };
    }
    const nickname = url.pathname.match(FACEIT_PLAYER)?.[1];
    if (nickname) {
      return {
        site: "faceit",
        kind: "player",
        nickname: decodeURIComponent(nickname),
      };
    }
  }

  if (url.hostname === "leetify.com" || url.hostname === "www.leetify.com") {
    const steamId = url.pathname.match(LEETIFY_PROFILE)?.[1];
    if (steamId) {
      return { site: "leetify", kind: "profile", steamId };
    }
    const gameId = url.pathname.match(LEETIFY_MATCH)?.[1];
    if (gameId) {
      return { site: "leetify", kind: "match", gameId: gameId.toLowerCase() };
    }
  }

  return { site: "none" };
}

export function samePage(a: Page, b: Page): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
