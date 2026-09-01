import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "my ALGO agent",
    short_name: "my ALGO agent",
    description:
      "Build, backtest, paper trade and run rule-based algo trading strategies with risk controls built in.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f9fc",
    theme_color: "#471898",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
