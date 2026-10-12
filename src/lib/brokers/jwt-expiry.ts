// Brokers that hand back a JWT access token put its end time in the token itself ("exp", seconds since 1970).
// Reading it needs no secret: the middle part is plain base64.

export function jwtExpiry(token: string): Date | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { exp?: unknown };
    return typeof payload.exp === "number" && payload.exp > 1_000_000_000 ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}
