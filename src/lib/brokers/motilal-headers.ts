// Kept in its own file so the login code (adapters.ts) and the order/account code (live-brokers.ts) can share it without importing each other.

/** The headers every call except login needs. Device fields are fixed, plausible values for a server-side app. */
export function motilalHeaders(creds: { apiKey: string; apiSecret?: string; clientId?: string }, token: string): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "MOSL/V.1.1.0",
    Authorization: token,
    ApiKey: creds.apiKey,
    apisecretkey: creds.apiSecret ?? "",
    vendorinfo: creds.clientId ?? "",
    ClientLocalIp: "127.0.0.1",
    ClientPublicIp: "127.0.0.1",
    MacAddress: "00:00:00:00:00:00",
    SourceId: "WEB",
    browsername: "Chrome",
    browserversion: "120.0",
    osname: "Linux",
    osversion: "6.0",
    devicemodel: "Server",
    manufacturer: "NA",
    productname: "MyAlgoAgent",
    productversion: "1.0",
  };
}
