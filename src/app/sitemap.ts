import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

const routes = [
  "",
  "/product",
  "/features",
  "/how-it-works",
  "/backtesting",
  "/paper-trading",
  "/live-trading",
  "/risk-management",
  "/technology",
  "/security",
  "/about",
  "/faq",
  "/contact",
  "/privacy-policy",
  "/terms",
  "/risk-disclosure",
  "/cookie-policy",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/product" ? 0.9 : 0.7,
  }));
}
