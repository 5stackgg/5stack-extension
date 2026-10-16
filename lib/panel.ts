import { storage } from "wxt/utils/storage";

export { normalizePanelOrigin, originPermission } from "./origin";

export const DEFAULT_PANEL = "https://5stack.gg";

export const panelOrigin = storage.defineItem<string>("local:panelOrigin", {
  fallback: DEFAULT_PANEL,
});

export const savedPanels = storage.defineItem<Array<string>>(
  "local:savedPanels",
  { fallback: [DEFAULT_PANEL] },
);

export type ImportState = "imported" | "queued" | "importing" | "failed" | "none";

export type Lookup = {
  state: ImportState;
  match_id?: string;
  match_ids?: Array<string>;
  reason?: string;
};

export type PanelUser = {
  steam_id: string;
  name: string;
  avatar_url: string | null;
  role: string;
  imports: { faceit: boolean; valve: boolean };
  faceit: { player_id: string; nickname: string | null } | null;
};

export class PanelError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(
  origin: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${origin}/extension/${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new PanelError(0, `Could not reach ${new URL(origin).host}.`);
  }

  // A panel without the extension's routes answers with its web app's HTML.
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new PanelError(
      404,
      "This panel does not support the extension yet. It needs a 5Stack update.",
    );
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      message?: unknown;
    } | null;
    const message = Array.isArray(error?.message)
      ? error.message.join(", ")
      : typeof error?.message === "string"
        ? error.message
        : response.status === 404
          ? "This panel does not support the extension yet."
          : `The panel answered ${response.status}`;
    throw new PanelError(response.status, message);
  }
  return (await response.json()) as T;
}

export const panel = {
  me: (origin: string) => call<PanelUser>(origin, "me"),
  logout: (origin: string) =>
    call<{ success: boolean }>(origin, "logout", {}),
  lookup: (
    origin: string,
    body: { faceit: Array<{ id: string; maps: number }>; valve: Array<string> },
  ) =>
    call<{ faceit: Record<string, Lookup>; valve: Record<string, Lookup> }>(
      origin,
      "lookup",
      body,
    ),
  importFaceit: (
    origin: string,
    body: { match_id: string; url: string },
  ) => call<Lookup>(origin, "faceit", body),
  importValve: (origin: string, shareCodes: Array<string>) =>
    call<{ valve: Record<string, Lookup> }>(origin, "valve", {
      share_codes: shareCodes,
    }),
};
