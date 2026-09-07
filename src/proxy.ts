import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// myalgoagent.com and www.myalgoagent.com both resolve and both serve this
// app (Amplify's domain association adds "www" as a live subdomain, not a
// redirect) — confirmed live with curl: both return 200 with no redirect.
// AUTH_URL is fixed to the apex domain, so Auth.js always builds the OAuth
// redirect_uri as https://myalgoagent.com/api/auth/callback/<provider>
// regardless of which host started the flow. A user who begins sign-in on
// www gets their PKCE/state cookie set for host www.myalgoagent.com, then
// Google/GitHub redirects back to the apex host — a different host never
// receives that cookie, so the callback fails to decode it ("InvalidCheck:
// pkceCodeVerifier value could not be parsed"), live-reproduced on 2026-09-07.
// Canonicalizing to the apex host before any page (including /login) is
// reached removes the two-host split entirely, for every route and device.
export function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  if (host === "www.myalgoagent.com") {
    const url = new URL(request.url);
    url.host = "myalgoagent.com";
    return NextResponse.redirect(url, 308);
  }
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
