import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  // HTTPS is already enforced by Amplify/CloudFront; this tells browsers to
  // never even try plain HTTP for this origin again, for a year.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // Prevents this site from being framed by another origin (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microphone only for our own pages (voice chat with the agent).
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next's inline hydration scripts need 'unsafe-inline'; 'unsafe-eval' is
      // only for the dev server's hot reload, never production. Google
      // Analytics (gtag.js) is loaded from googletagmanager.com.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com`,
      "style-src 'self' 'unsafe-inline'",
      // blob: = local previews (e.g. a profile photo before upload).
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // Google's OAuth pages, our own API/market-data routes, GA4's beacon
      // endpoints (gtag sends hits to both of these hosts), and Amazon
      // Transcribe streaming for voice chat (a pre-signed WebSocket).
      "connect-src 'self' https://accounts.google.com https://query1.finance.yahoo.com https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com wss://transcribestreaming.ap-south-1.amazonaws.com:8443",
      "frame-src https://accounts.google.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework in every response.
  poweredByHeader: false,
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
