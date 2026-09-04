import type { NextConfig } from "next";

const securityHeaders = [
  // HTTPS is already enforced by Amplify/CloudFront; this tells browsers to
  // never even try plain HTTP for this origin again, for a year.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // Prevents this site from being framed by another origin (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js needs inline/eval script in dev; kept permissive enough for
      // Next's own runtime/hydration scripts in both dev and prod. Google
      // Analytics (gtag.js) is loaded from googletagmanager.com.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      // Google's OAuth pages, our own API/market-data routes, and GA4's
      // beacon endpoints (gtag sends hits to both of these hosts).
      "connect-src 'self' https://accounts.google.com https://query1.finance.yahoo.com https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com",
      "frame-src https://accounts.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
