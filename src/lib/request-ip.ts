import { headers } from "next/headers";

/**
 * The caller's real IP, for per-IP rate limits. Behind Amplify's CloudFront
 * the X-Forwarded-For chain is "<whatever the client sent>, <real client>,
 * <CloudFront edge>" — its first entry is attacker-controlled (verified live
 * 2026-09-28), so it must never be trusted. CloudFront's own
 * CloudFront-Viewer-Address ("ip:port") is authoritative; failing that, the
 * entry CloudFront appended (second from the end).
 */
export function clientIpFrom(get: (name: string) => string | null): string {
  const viewer = get("cloudfront-viewer-address");
  if (viewer) {
    const ip = viewer.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
    if (ip) return ip;
  }
  const chain = (get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (chain.length >= 2) return chain[chain.length - 2];
  return chain[0] ?? "unknown";
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return clientIpFrom((n) => h.get(n));
}
