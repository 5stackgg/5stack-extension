export type Candidate = {
  key: string;
  source: "faceit" | "valve";
  id: string;
  maps: number;
  mapNames: Array<string>;
  finishedAt: string | null;
  score: string | null;
  title: string | null;
};

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
