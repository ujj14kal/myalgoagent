import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about my ALGO agent's algo trading platform, backtesting, paper trading and live execution.",
  alternates: { canonical: `${siteUrl}/faq` },
};

const faqs = [
  { q: "Is my ALGO agent a broker?", a: "No. my ALGO agent is software that connects to supported broker APIs on your behalf, with your explicit authorization. It does not custody funds or execute trades independently of your broker account." },
  { q: "Is backtested performance guaranteed?", a: "No. Historical and backtested performance does not guarantee future results. Markets change, and live execution can differ from simulated fills. See our Risk Disclosure." },
  { q: "What's the difference between paper and live trading?", a: "Paper trading simulates orders against live market data using virtual capital — no real money is at risk. Live trading places real orders through a connected broker account and requires explicit confirmation." },
  { q: "Can a strategy start live trading automatically?", a: "No. Live trading always requires a connected, tested broker account, configured risk limits, and an explicit manual start from the user." },
  { q: "How are broker credentials protected?", a: "Broker API credentials are handled through secure secret management and are never exposed to browser-side code or stored in application source code." },
  { q: "What happens if the broker connection drops?", a: "The platform is designed to stop placing new orders and reconcile state once the connection is restored, rather than guessing at account state." },
  { q: "Does the AI assistant give financial advice?", a: "No. AI features are informational — helping translate ideas into rules or summarize results — and are never presented as guaranteed returns or personalized financial advice." },
  { q: "Is my ALGO agent affiliated with Amazon or AWS?", a: "No. my ALGO agent uses AWS as third-party cloud infrastructure. There is no endorsement, sponsorship or partnership with Amazon or AWS." },
];

export default function FaqPage() {
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: siteUrl },
      { name: "FAQ", url: `${siteUrl}/faq` },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
  return (
    <>
      {jsonLd.map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      ))}
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/faq", label: "FAQ" }]} />
      <PageHeader eyebrow="FAQ" title="Frequently asked questions" />
      <Prose>
        {faqs.map((f) => (
          <div key={f.q}>
            <h2>{f.q}</h2>
            <p>{f.a}</p>
          </div>
        ))}
      </Prose>
    </>
  );
}
