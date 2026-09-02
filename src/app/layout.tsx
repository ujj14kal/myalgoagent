import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import Header from "@/components/header";
import Footer from "@/components/footer";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://myalgoagent.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "MyAlgoAgent — Algo Trading Platform",
    template: "%s | MyAlgoAgent",
  },
  description:
    "MyAlgoAgent is an algo-trading software platform for building, backtesting, paper trading and running rule-based strategies with risk controls built in.",
  applicationName: "MyAlgoAgent",
  keywords: [
    "algo trading",
    "algorithmic trading platform",
    "strategy builder",
    "backtesting engine",
    "paper trading",
    "trading risk management",
  ],
  authors: [{ name: "MyAlgoAgent" }],
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "MyAlgoAgent",
    title: "MyAlgoAgent — Algo Trading Platform",
    description:
      "Build, backtest, paper trade and run rule-based algo trading strategies with risk controls built in.",
    images: [{ url: "/brand/icon-512.png", width: 512, height: 512, alt: "MyAlgoAgent" }],
  },
  twitter: {
    card: "summary",
    title: "MyAlgoAgent — Algo Trading Platform",
    description:
      "Build, backtest, paper trade and run rule-based algo trading strategies with risk controls built in.",
    images: ["/brand/icon-512.png"],
  },
  alternates: {
    canonical: siteUrl,
  },
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MyAlgoAgent",
    url: siteUrl,
    logo: `${siteUrl}/brand/icon-512.png`,
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "MyAlgoAgent",
    url: siteUrl,
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "MyAlgoAgent",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: siteUrl,
    description:
      "Software platform for building, backtesting, paper trading and running rule-based algo trading strategies with risk controls.",
  },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-brand-bg text-brand-navy">
        {jsonLd.map((ld, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
          />
        ))}
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        )}
      </body>
    </html>
  );
}
