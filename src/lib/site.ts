import type { Metadata } from "next";

export const siteUrl = "https://myalgoagent.com";
export const siteName = "MyAlgoAgent";

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Full per-page metadata including Open Graph + Twitter. Next.js replaces
 * (not merges) a parent's `openGraph` object when a page sets its own, so
 * every field is spelled out here — a page that only set title/description
 * used to inherit the homepage's og:title/description/url, making every
 * shared link preview as the homepage.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = `${siteUrl}${path}`;
  const fullTitle = `${title} | ${siteName}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName,
      title: fullTitle,
      description,
      images: [{ url: "/brand/icon-512.png", width: 512, height: 512, alt: siteName }],
    },
    twitter: {
      card: "summary",
      title: fullTitle,
      description,
      images: ["/brand/icon-512.png"],
    },
  };
}
