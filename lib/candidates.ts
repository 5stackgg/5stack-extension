export type MatchStats = {
  kills?: number;
  deaths?: number;
  assists?: number;
  adr?: number;
  headshotPercent?: number;
  rating?: number;
  eloDelta?: number;
};

export type Candidate = {
  key: string;
  source: "faceit" | "valve";
  id: string;
  maps: number;
  mapNames: Array<string>;
  finishedAt: string | null;
  score: string | null;
  title: string | null;
  own: boolean;
  result?: "win" | "loss" | "tie";
  stats?: MatchStats;
};

export function number(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return value === undefined || value === null || value === "" || !Number.isFinite(parsed)
    ? undefined
    : parsed;
}

// A score reads from the player's side: their rounds first.
export function ownScore(
  rounds: [number, number],
  result: Candidate["result"],
): string {
  if (!result) {
    return `${rounds[0]} : ${rounds[1]}`;
  }
  const [high, low] = rounds[0] >= rounds[1] ? rounds : [rounds[1], rounds[0]];
  return result === "loss" ? `${low} : ${high}` : `${high} : ${low}`;
}

export function faceitCandidate(
  fields: Omit<Candidate, "key" | "source">,
): Candidate {
  return { ...fields, key: `faceit:${fields.id}`, source: "faceit" };
}

export function valveCandidate(
  fields: Omit<Candidate, "key" | "source" | "maps">,
): Candidate {
  return { ...fields, key: `valve:${fields.id}`, source: "valve", maps: 1 };
}

export function mapLabel(name: string): string {
  const bare = name.replace(/^(de|cs|ar)_/, "");
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}
