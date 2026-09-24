import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "FAQ",
  description:
    "Frequently asked questions about MyAlgoAgent's algo trading platform, backtesting, paper trading and live execution.",
  path: "/faq",
});

const faqs: { id: string; q: string; a: string }[] = [
  { id: "broker", q: "Is MyAlgoAgent a broker?", a: "No. MyAlgoAgent is software that connects to supported broker APIs on your behalf, with your explicit authorization. It does not custody funds or execute trades independently of your broker account." },
  { id: "backtest-guarantee", q: "Is backtested performance guaranteed?", a: "No. Historical and backtested performance does not guarantee future results. Markets change, and live execution can differ from simulated fills. See our Risk Disclosure." },
  { id: "paper-vs-live", q: "What's the difference between paper and live trading?", a: "Paper trading simulates orders on end-of-day market data using virtual capital — no real money is at risk. Live trading, coming soon, will place real orders through a connected broker account and require explicit confirmation." },
  { id: "auto-start", q: "Can a strategy start live trading automatically?", a: "No. Live trading is coming soon, and when it launches it will always require a connected, tested broker account, configured risk limits, and an explicit manual start from you." },
  { id: "credentials", q: "How are broker credentials protected?", a: "Broker API credentials are handled through secure secret management and are never exposed to browser-side code or stored in application source code." },
  { id: "disconnect", q: "What happens if the broker connection drops?", a: "Live trading is coming soon. When it launches, the platform is designed to stop placing new orders and reconcile state once the connection is restored, rather than guessing at account state." },
  { id: "ai-advice", q: "Does the AI assistant give financial advice?", a: "No. Your in-app agent is informational only — it explains the platform and trading concepts and prepares strategies, backtests and settings for you to review and confirm — and never presented as guaranteed returns or personalized financial advice." },
  { id: "aws-affiliation", q: "Is MyAlgoAgent affiliated with Amazon or AWS?", a: "No. MyAlgoAgent uses AWS as third-party cloud infrastructure. There is no endorsement, sponsorship or partnership with Amazon or AWS." },
];

const sections: LegalSection[] = faqs.map((f) => ({ id: f.id, title: f.q, paragraphs: [f.a] }));

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
      <LegalPage
        label="Support / FAQ"
        title="Frequently asked questions"
        updated="September 2026"
        intro="Straight answers to the questions we hear most, about how the platform actually works."
        sections={sections}
        breadcrumbLabel="FAQ"
        breadcrumbHref="/faq"
      />
    </>
  );
}
