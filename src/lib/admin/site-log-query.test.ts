import { describe, expect, it } from "vitest";
import { hourBuckets, parseLogFilters, siteEventWhere } from "./site-log-query";

const now = new Date("2026-10-15T12:30:00Z");

describe("parseLogFilters", () => {
  it("defaults to errors in the last 24 hours", () => expect(parseLogFilters({})).toMatchObject({ tab: "errors", range: "24h", hours: 24, q: "", user: "", source: "", page: 1 }));
  it("ignores junk", () => expect(parseLogFilters({ tab: "x", range: "9y", source: "mars", page: "-4" })).toMatchObject({ tab: "errors", range: "24h", source: "", page: 1 }));
  it("reads the tab, range and search", () => expect(parseLogFilters({ tab: "signins", range: "7d", q: " login ", user: "a@b.co" })).toMatchObject({ tab: "signins", hours: 168, q: "login", user: "a@b.co" }));
});

describe("siteEventWhere", () => {
  it("errors tab covers server, browser and engine errors in the window", () => {
    const w = siteEventWhere(parseLogFilters({}), null, now) as { kind: { in: string[] }; at: { gte: Date } };
    expect(w.kind.in).toEqual(["server_error", "client_error", "engine_error"]);
    expect(w.at.gte.toISOString()).toBe("2026-10-14T12:30:00.000Z");
  });
  it("sign-ins tab covers successes and failures", () => expect((siteEventWhere(parseLogFilters({ tab: "signins" }), null, now) as { kind: { in: string[] } }).kind.in).toEqual(["sign_in", "sign_in_failed"]));
  it("a user that matched nothing shows nothing, not everything", () => expect(siteEventWhere(parseLogFilters({ user: "ghost" }), null, now)).toMatchObject({ userId: "no-such-user" }));
  it("a matched user narrows to that account", () => expect(siteEventWhere(parseLogFilters({ user: "a@b.co" }), "u1", now)).toMatchObject({ userId: "u1" }));
  it("search looks in message, context and path", () => expect((siteEventWhere(parseLogFilters({ q: "map" }), null, now) as { OR: unknown[] }).OR).toHaveLength(3));
});

describe("hourBuckets", () => {
  it("counts per hour, folded repeats included, with empty hours as zero", () => {
    const b = hourBuckets([{ at: new Date("2026-10-15T12:05:00Z"), count: 3 }, { at: new Date("2026-10-15T10:59:00Z"), count: 1 }, { at: new Date("2026-10-10T00:00:00Z"), count: 9 }], 4, now);
    expect(b.map((x) => x.value)).toEqual([0, 1, 0, 3]);
  });
});
