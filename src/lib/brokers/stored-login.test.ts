import { afterEach, describe, expect, it, vi } from "vitest";
import { ADAPTERS } from "./adapters";

const creds = { apiKey: "key", clientId: "1100012345", pin: "123456", totpSecret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", method: "stored" as const };

afterEach(() => vi.restoreAllMocks());

function mockFetch(status: number, json: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(json), { status }));
}

describe("Dhan stored login", () => {
  it("signs in with client id, PIN and a fresh code, and reads the session back", async () => {
    const f = mockFetch(200, { accessToken: "tok", expiryTime: "2026-10-14T09:00:00", dhanClientName: "Test", dhanClientId: "1100012345" });
    const s = await ADAPTERS.dhan!.exchange(creds, new URLSearchParams(), "");
    expect(s.accessToken).toBe("tok");
    expect(s.accountName).toBe("Test");
    const url = String(f.mock.calls[0][0]);
    expect(url).toContain("https://auth.dhan.co/app/generateAccessToken?");
    expect(url).toContain("dhanClientId=1100012345");
    expect(url).toContain("pin=123456");
    expect(url).toMatch(/totp=\d{6}/);
  });
  it("reports a refusal as a credential problem", async () => {
    mockFetch(401, { message: "Invalid TOTP" });
    await expect(ADAPTERS.dhan!.exchange(creds, new URLSearchParams(), "")).rejects.toMatchObject({ failure: { code: expect.any(String) } });
  });
  it("sends the user to the connecting screen, not a broker page", async () => {
    expect(await ADAPTERS.dhan!.loginUrl(creds, { state: "s", redirectUri: "r" })).toBe("/app/broker-connections/connecting/dhan");
  });
});

describe("Angel One stored login", () => {
  it("logs in by password with the app key and a fresh code", async () => {
    const f = mockFetch(200, { status: true, data: { jwtToken: "jwt" } });
    f.mockResolvedValueOnce(new Response(JSON.stringify({ status: true, data: { jwtToken: "jwt" } }), { status: 200 }));
    const s = await ADAPTERS.angelone!.exchange(creds, new URLSearchParams(), "");
    expect(s.accessToken).toBe("jwt");
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain("/user/v1/loginByPassword");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({ clientcode: "1100012345", password: "123456" });
    expect(body.totp).toMatch(/^\d{6}$/);
    expect(((init as RequestInit).headers as Record<string, string>)["X-PrivateKey"]).toBe("key");
  });
});
