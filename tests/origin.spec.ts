import { describe, expect, it } from "vitest";
import { normalizePanelOrigin, originPermission } from "../lib/origin";

describe("normalizePanelOrigin", () => {
  it.each([
    ["5stack.gg", "https://5stack.gg"],
    ["  5stack.gg/ ", "https://5stack.gg"],
    ["https://5stack.gg/matches/123", "https://5stack.gg"],
    ["panel.example.com:8443", "https://panel.example.com:8443"],
    ["localhost:3000", "http://localhost:3000"],
    ["127.0.0.1:3000/", "http://127.0.0.1:3000"],
  ])("turns %s into %s", (input, origin) => {
    expect(normalizePanelOrigin(input)).toBe(origin);
  });

  it.each(["", "http://5stack.gg", "ftp://5stack.gg", "https://"])(
    "refuses %j",
    (input) => {
      expect(normalizePanelOrigin(input)).toBeNull();
    },
  );

  it("asks for the panel's host whatever its port", () => {
    expect(originPermission("http://localhost:3000")).toBe("http://localhost/*");
    expect(originPermission("https://5stack.gg")).toBe("https://5stack.gg/*");
  });
});
