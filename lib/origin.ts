const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

// Nobody types a scheme. "5stack.gg", "https://5stack.gg/matches/1" and
// "localhost:3000" all name a panel; a bare local host gets http because a
// development panel is not on TLS.
export function normalizePanelOrigin(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `${LOCAL_HOSTS.has(trimmed.split(/[:/]/)[0] ?? "") ? "http" : "https"}://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol === "https:") {
      return url.origin;
    }
    if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) {
      return url.origin;
    }
    return null;
  } catch {
    return null;
  }
}

export function originPermission(origin: string): string {
  return `${new URL(origin).protocol}//${new URL(origin).hostname}/*`;
}
