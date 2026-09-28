import { describe, expect, it } from "vitest";
import { clientIpFrom } from "./request-ip";

const from = (h: Record<string, string>) => clientIpFrom((n) => h[n] ?? null);

describe("clientIpFrom", () => {
  it("uses CloudFront's viewer address, ignoring a spoofed X-Forwarded-For (as seen live)", () => {
    expect(from({ "cloudfront-viewer-address": "223.190.83.48:6396", "x-forwarded-for": "203.0.113.99, 223.190.83.48, 64.252.100.7" })).toBe("223.190.83.48");
  });
  it("handles IPv6 viewer addresses", () => {
    expect(from({ "cloudfront-viewer-address": "2001:db8::1:46532" })).toBe("2001:db8::1");
  });
  it("falls back to the entry CloudFront appended, never the client-supplied first one", () => {
    expect(from({ "x-forwarded-for": "203.0.113.99, 223.190.83.48, 64.252.100.7" })).toBe("223.190.83.48");
    expect(from({ "x-forwarded-for": "198.51.100.7" })).toBe("198.51.100.7");
    expect(from({})).toBe("unknown");
  });
});
