// The only places a user's relay may connect to (port 443): the broker APIs we talk to. Mirrors infra/egress-proxy.
export const RELAY_ALLOW_HOSTS = [
  "api.kite.trade", "kite.zerodha.com", "developers.kite.trade",
  "api.upstox.com", "api-hft.upstox.com", "account.upstox.com",
  "api-t1.fyers.in", "myapi.fyers.in",
  "apiconnect.angelone.in", "smartapi.angelone.in",
  "api.groww.in", "groww.in", "growwapi-assets.groww.in",
  "api.dhan.co", "auth.dhan.co",
  "api.icicidirect.com",
  "openapi.5paisa.com", "dev-openapi.5paisa.com", "xstream.5paisa.com",
  "a3.aliceblueonline.com", "ant.aliceblueonline.com",
  "checkip.amazonaws.com",
] as const;
