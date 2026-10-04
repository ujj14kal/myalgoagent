import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "FAQ",
  description:
    "Frequently asked questions about MyAlgoAgent's algo trading platform, backtesting, forward testing and live execution.",
  path: "/faq",
});

const faqs: { id: string; q: string; a: string }[] = [
  { id: "broker", q: "Is MyAlgoAgent a broker?", a: "No. MyAlgoAgent is software that connects to supported broker APIs on your behalf, with your explicit authorization. It does not custody funds or execute trades independently of your broker account." },
  { id: "backtest-guarantee", q: "Is backtested performance guaranteed?", a: "No. Historical and backtested performance does not guarantee future results. Markets change, and live execution can differ from hypothetical fills. See our Risk Disclosure." },
  { id: "forward-vs-live", q: "What's the difference between forward testing and live trading?", a: "Forward testing simulates orders on market data — daily or intraday candles, updated automatically about every 5 minutes during market hours — using notional capital, so no real money is at risk. Live trading places real orders through your connected broker account: you start a strategy yourself (Go Live, with a risk acknowledgement), and its orders then go out automatically whenever its rules trigger, within your risk limits." },
  { id: "auto-start", q: "Can a strategy start live trading automatically?", a: "No — you start it. Live trading is rolled out account by account and needs a connected broker account with your static IP registered, a readiness check that has passed, and your Go Live with a risk acknowledgement. After that, its orders are sent automatically when its rules trigger, each checked first against your limits and the kill switch; you can pause it, exit the position or stop it at any time." },
  { id: "connect-broker", q: "Which brokers can I connect?", a: "Dhan, Zerodha, Upstox, Fyers, Angel One, Groww, ICICI Direct, 5paisa and Alice Blue today, with Kotak Neo coming next. You create a free API app on your broker's developer site, paste the Redirect URL we give you, paste your API key on the Broker Connections page and log in on your broker's own page. Connecting is free; live trading on a connected account is switched on account by account." },
  { id: "daily-login", q: "Why do I have to log in to my broker every day?", a: "Exchange rules make every broker end API sessions daily (for example Zerodha at 6 AM and Upstox at 3:30 AM). Your API keys stay saved — one click on \u201cLog in for today\u201d on the Broker Connections page starts the new session. Two brokers make it even quicker: with Groww you can choose automatic login with Groww's API TOTP key (no daily approval), and with Upstox you can approve with a tap in the Upstox app or on WhatsApp instead of a login page." },
  { id: "credentials", q: "How are broker credentials protected?", a: "Your broker API key, secret and each day's session token are encrypted with AES-256 before they're stored, locked to your account, and never sent back to the browser — not even to you. Your broker password, PIN and login 2FA are only ever entered on your broker's own login page; MyAlgoAgent never sees them. If you choose Groww's automatic login, the TOTP token and secret of the Groww API key you created are encrypted the same way and used only to start your daily Groww session. Disconnecting deletes everything we hold." },
  { id: "disconnect", q: "What happens if the broker connection drops?", a: "No new live orders are sent without a working session — each one is checked first. If the broker doesn't answer, the order is recorded and then confirmed with the broker by its reference, so it's never sent twice or guessed at. You can refresh or cancel open orders from Live Trading, and your broker's own app always shows the true state." },
  { id: "ai-advice", q: "Does the AI assistant give financial advice?", a: "No. Your in-app agent is informational only — it explains the platform and trading concepts and prepares strategies, backtests and settings for you to review and confirm — and never presented as guaranteed returns or personalized financial advice." },
  { id: "ai-voice", q: "Can I talk to my agent instead of typing?", a: "Yes. Tap the microphone in the chat to dictate a message, tap the speaker under any reply to hear it read aloud, or switch on voice mode for a hands-free conversation. Voice follows exactly the same rules as typed chat — your agent still never gives investment advice, and anything it prepares opens a review window for you to confirm. Your browser asks for microphone permission first, and the microphone is only on while you're using it." },
  { id: "get-help", q: "How do I get help from a person?", a: "Open Help & Support in the app (or use the Contact page) and send us a request. Our team replies there — you'll get a notification and an email — and you can reply back in the same conversation. Feedback you send with the feedback button shows up there too, with any reply from us." },
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
