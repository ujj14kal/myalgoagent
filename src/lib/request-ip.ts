import { headers } from "next/headers";

/** The caller's IP (first hop of x-forwarded-for, as set by the CDN) for per-IP rate limits. */
export async function clientIp(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
