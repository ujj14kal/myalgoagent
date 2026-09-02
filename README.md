# MyAlgoAgent

An algo-trading software platform for building, backtesting, paper trading
and running rule-based trading strategies with risk controls built in.

This repository currently contains the **public marketing/documentation
site**: branding, SEO-correct pages describing the product, the planned
technology/AWS architecture, and legal-page templates. The authenticated
trading application (strategy builder, backtesting engine, broker
integration, dashboard) is the next phase of work — see
[Roadmap](#roadmap).

## Tech stack

- [Next.js](https://nextjs.org) (App Router, TypeScript) — SSR/SSG so
  pages are crawlable and fast
- [Tailwind CSS](https://tailwindcss.com) v4
- Deployed target: AWS (see [`/technology`](src/app/technology/page.tsx)
  for the planned architecture — ECS Fargate, RDS Postgres, ElastiCache,
  S3, Secrets Manager, CloudFront, CloudWatch)

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
npm run start   # run the production build locally
npm run lint     # eslint
```

## Project structure

```
src/
  app/            Route segments (one folder per public page)
    robots.ts     Dynamic robots.txt
    sitemap.ts     Dynamic sitemap.xml
    manifest.ts    Web app manifest
    layout.tsx     Root layout: metadata, Organization/WebSite/
                    SoftwareApplication JSON-LD, header/footer
  components/     Shared UI (header, footer, logo, page header, prose)
  lib/site.ts      Site constants + structured-data helpers
public/
  brand/           Logo source (SVG) and generated icon/favicon assets
```

## Branding

The logo was rebuilt as a clean vector (`public/brand/icon-mark.svg`) from
the source PDF brand sheet, since the original export was a low-resolution
raster. Brand colors (see `src/app/globals.css`):

| Token | Hex | Use |
|---|---|---|
| Primary | `#471898` | Logo, primary buttons, links |
| Gold | `#bda360` | Accents |
| Navy | `#0e1b2d` | Text |
| Blue | `#466fff` | Accents |
| Background | `#f7f9fc` | Page background |
| Buy/Profit | `#00a83e` | Positive P&L, buy indicators |
| Sell/Loss | `#d60000` | Negative P&L, sell indicators |

Regenerate PNG/ICO assets from the SVG source with:

```bash
cd public/brand
for s in 16 32 48 64 128 180 192 256 384 512; do
  cairosvg icon-mark.svg -o icon-$s.png -W $s -H $s
done
```

## SEO / launch readiness implemented so far

- Server-rendered pages (no client-only rendering of important content)
- Unique `<title>`/meta description and canonical URL per page
- `robots.ts` / `sitemap.ts` (dynamic, so they stay in sync with routes)
- Organization, WebSite, SoftwareApplication and BreadcrumbList
  structured data (JSON-LD)
- Open Graph / Twitter metadata
- Custom 404 page
- Favicon + app icons at multiple sizes, referenced from a single brand
  source

Not yet done: production domain/HTTPS setup, Google Search Console
verification and sitemap submission (these require a live deployment).

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | No | GA4 Measurement ID (`G-XXXXXXXXXX`). Analytics is skipped entirely if unset. |

When the application layer is added, secrets (database URL, broker API
keys, JWT signing key, etc.) must be provided via environment variables /
AWS Secrets Manager — never committed to source control.

## Roadmap

1. **Foundation** — authentication, database schema, design system (this repo)
2. **Trading core** — instruments, charts, strategy engine, order model, portfolio, risk engine
3. **Backtesting** — historical data, execution simulation, metrics, trade analysis
4. **Paper trading** — simulated execution against live data
5. **Broker/live** — secure broker integration, reconciliation, kill switch
6. **Advanced** — optimization, AI assistant, marketplace architecture
7. **Launch** — production AWS deployment, Search Console verification, full QA

## Legal

Pages under `/privacy-policy`, `/terms`, `/risk-disclosure` and
`/cookie-policy` are **templates** and must be reviewed by qualified legal
counsel for your jurisdiction and business model before public launch.
