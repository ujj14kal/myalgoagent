import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

// The assistant's voice plays audio from blob: URLs (the reply's first sentence, and later pieces) and unlocks the player
// with a data: clip. A policy without media-src blocks all of it, silently, for every user.
describe("Content-Security-Policy", () => {
  it("lets the page play audio from blob: and data: URLs", async () => {
    const rules = await nextConfig.headers!();
    const csp = rules[0].headers.find((h) => h.key === "Content-Security-Policy")!.value;
    const media = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("media-src"));
    expect(media).toBeDefined();
    expect(media).toMatch(/'self'/);
    expect(media).toMatch(/blob:/);
    expect(media).toMatch(/data:/);
  });
  it("still keeps everything else locked to our own origin", async () => {
    const csp = (await nextConfig.headers!())[0].headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
  });
});
