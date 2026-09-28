import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "MyAlgoAgent's Privacy Policy: what data we collect (including via Google sign-in), why we collect it, how it's stored and protected, who we share it with, your rights, and how to contact us.",
  path: "/privacy-policy",
});

const sections: LegalSection[] = [
  {
    id: "overview",
    title: "Overview",
    paragraphs: [
      "This Privacy Policy explains how MyAlgoAgent (“MyAlgoAgent,” “we,” “us,” or “our”), a product of Shagoon Softech Pvt. Ltd., collects, uses, stores, shares and protects information when you visit our website or use our algo-trading software platform (together, the “Service”). It applies to visitors of the public marketing site and to registered users of the authenticated application.",
    ],
  },
  {
    id: "information",
    title: "Information we collect",
    paragraphs: [
      "Account information you provide directly: name and email address when you create an account, any profile information you choose to add, and communications you send us — support requests, feedback, and your replies in those conversations, together with our team's replies.",
      "Usage and device information: pages visited, features used, when you last used the app, device and browser type, approximate location derived from IP address (for security and fraud prevention, not precise geolocation), and log data such as timestamps, referring URLs and error reports.",
      "Trading configuration and platform data: strategies, backtest settings, risk limits, and — only if you connect a broker — the API key and secret of the API app you created at your broker, that day's session token, and the broker client ID and account name your broker returns (all keys and tokens encrypted). If you choose Groww's automatic login, we also store the TOTP token and TOTP secret of the Groww API key you created (encrypted), and use them only to generate one-time codes that start your daily Groww API session. We never receive or store your broker account password, PIN or login 2FA codes — you enter those only on your broker's own login page.",
    ],
  },
  {
    id: "google-sign-in",
    title: "Information obtained through Google Sign-In",
    paragraphs: [
      "When you choose to sign in with Google, we receive your name, your email address (used as your unique account identifier), your Google profile picture if available, and a unique, non-reversible Google account identifier used internally to link your session to your account.",
      "We request only the openid, email and profile OAuth scopes from Google — the minimum needed for authentication. We do not request access to your Gmail, Google Drive, Google Calendar, contacts, or any other Google service or data. We do not post to any Google service on your behalf, and we do not sell or share this data with third parties for their own marketing purposes.",
    ],
  },
  {
    id: "why",
    title: "Why we collect this information",
    bullets: [
      "To create, authenticate and secure your account, including via Google Sign-In.",
      "To provide, operate and maintain the features of the Service.",
      "To detect, investigate and prevent fraudulent, unauthorized or abusive activity.",
      "To maintain audit logs required for a financial-software product handling trading actions.",
      "To communicate with you about your account, security notices, or support requests.",
      "To understand aggregate usage patterns and improve reliability and performance.",
      "To comply with applicable legal and regulatory obligations.",
    ],
  },
  {
    id: "storage",
    title: "How we store and protect your information",
    paragraphs: [
      "Account and platform data is stored in a managed PostgreSQL database hosted on Amazon Web Services (AWS) infrastructure, protected in transit with TLS/SSL encryption. Broker API keys, secrets and session tokens you connect are encrypted (AES-256) before storage with a key held separately from the database, and are never exposed to client-side/browser code. We never receive your broker password, PIN or 2FA codes — those are entered only on your broker\u2019s own page. Access to production data is restricted to what is operationally necessary.",
    ],
  },
  {
    id: "staff-access",
    title: "Who at MyAlgoAgent can see your information",
    paragraphs: [
      "A small team at Shagoon Softech Pvt. Ltd. operates the Service through an internal admin portal. Access is role-based: support staff can see what they need to answer you (your account details, the conversations you've had with us, and a summary of your activity such as how many strategies and sessions you have), and only administrators can take actions on an account. Phone numbers are shown masked.",
      "Staff can never see your password, your broker API keys, secrets or session tokens (these are encrypted and not displayable), or the contents of your conversations with your AI agent — with one exception: if you rate one of its replies as not helpful, our team may review that reply and the question before it to improve the agent.",
      "Every action staff take in the portal — including opening an account's details — is recorded in an audit log with who did it and when. Staff may reply to your support requests, message you about your account (these appear on your Help & Support page and by email), suspend an account that breaches our Terms (which signs it out and pauses its forward testing), fulfil data-export or deletion requests you make, and post service announcements shown in the app.",
    ],
  },
  {
    id: "sharing",
    title: "How we share information",
    paragraphs: ["We do not sell your personal data. We share information only:"],
    bullets: [
      "With infrastructure and service providers who process data on our behalf strictly to operate the Service.",
      "With your connected broker: your API key, secret and session token are sent only to that broker's official API — today to log you in and verify your account, and, once live trading launches, to place, modify, cancel or synchronize orders you have configured and explicitly authorized.",
      "Where required to comply with a legal obligation, court order, or governmental request.",
      "To protect the rights, property or safety of MyAlgoAgent, our users, or the public, where legally permitted.",
      "In connection with a merger, acquisition, or sale of assets, subject to continued protection under a policy at least as protective as this one.",
    ],
    extra: (
      <p className="mt-4 text-sm leading-relaxed text-brand-navy/70">
        Our sub-processors — companies that process data on our behalf under the categories above — are: Amazon Web Services (hosting, database, email delivery, AI processing through Amazon Bedrock, and voice through Amazon Transcribe and Amazon Polly) and Google (OAuth sign-in and analytics).
      </p>
    ),
  },
  {
    id: "ai-assistant",
    title: "Your AI agent (in-app assistant)",
    paragraphs: [
      "Inside the app you can chat with your agent, an AI assistant that explains the platform and trading concepts and prepares actions for you — a strategy, a backtest, a forward test, new loss limits — which you review and confirm. It never places trades or changes anything on its own, and it does not give investment advice.",
      "When you send it a message, the text of that message and of the recent conversation, general information about the platform and — so it can answer about your account — the names and results of your strategies, backtests, forward tests and risk settings, and — when you ask about connecting a broker — which brokers you've connected and their status (never your keys or tokens) are sent to Amazon Bedrock (an AWS service) to generate a reply. Bedrock may process this text in AWS data centers outside India; AWS does not use it to train models and does not retain it after generating the reply. We do not include your name, email address or phone number in these requests — if you paste something that looks like a key, secret, token, password or OTP, it is hidden before the message is stored or sent. Please don’t type personal or financial identifiers (such as PAN, Aadhaar or bank details) into the chat.",
      "Voice is optional. When you speak to your agent (the microphone in the chat, or voice mode), your browser streams the audio directly to Amazon Transcribe in AWS's Mumbai region, which turns it into text; we don't receive or store the audio, only the resulting text, which is then handled like a typed message. When your agent reads a reply aloud, the reply's text is sent to Amazon Polly (AWS, Singapore region, or Mumbai as a fallback) to generate the speech. The microphone is used only while you have it switched on, and your browser asks for your permission first.",
      "Your conversations are stored in our database in India so you can revisit them, are included in your account data export, and are deleted when your account is deleted. We keep usage details (such as message counts and processing time) and any ratings you give its replies, to operate and improve the service, prevent abuse and manage costs. Our team doesn't read your conversations; if you rate a reply as not helpful, that reply and the question before it may be reviewed to improve the agent.",
    ],
  },
  {
    id: "email",
    title: "Email communications",
    paragraphs: [
      "We send service email only — never marketing or promotional email, and never to a purchased or imported list. Most emails are triggered directly by an action you take: account verification, a password-reset link, a sign-in (“magic link”) email, a confirmation that we received a support request or feedback, or our team's reply to it. We may also email you important notices about your account or the Service — for example a message from our team about your account, planned maintenance, or changes to our Terms or this policy. If an email to your address bounces or you mark one as spam, our provider (Amazon SES) automatically suppresses future sends to that address until the issue is resolved.",
    ],
  },
  {
    id: "retention",
    title: "Data retention",
    paragraphs: [
      "We retain account and trading-configuration data for as long as your account remains active, and for a reasonable period afterward as needed to meet audit, security, tax, and legal record-keeping obligations applicable to financial software. Your broker API keys and tokens are deleted as soon as you disconnect that broker or delete your account. Automated database backups are kept for seven days, so deleted data can remain in a backup for up to seven days before it is overwritten. Technical error logs — which never contain passwords or broker keys — are kept for 90 days. Support conversations and feedback are kept while your account is active and deleted with it. Records of actions our staff took (the admin audit log, which may include your email address) are kept for up to two years for security and accountability, then deleted. You may request earlier deletion as described under “Your rights” below, subject to any retention we are legally required to maintain (for example, records of executed trades).",
    ],
  },
  {
    id: "cookies",
    title: "Cookies and similar technologies",
    paragraphs: [
      "We use essential cookies required for authentication and session security, and, where enabled, analytics cookies to understand aggregate site usage. See our Cookie Policy for full details and how to manage your preferences.",
    ],
  },
  {
    id: "rights",
    title: "Your rights",
    paragraphs: [
      "Depending on your jurisdiction, you may have the right to: access the personal data we hold about you; correct inaccurate data; request deletion of your data; export your data in a portable format; object to or restrict certain processing; and withdraw consent where processing is based on consent (such as disconnecting Google sign-in, or revoking access from your Google account settings). To exercise any of these rights, contact us using the details below. We aim to respond to any data request within 30 days.",
    ],
  },
  {
    id: "international",
    title: "International data transfers",
    paragraphs: [
      "Our infrastructure is hosted on AWS and may process data in data centers located outside your country of residence. Where we transfer personal data internationally, we take steps intended to ensure the data continues to be protected in accordance with this Privacy Policy.",
    ],
  },
  {
    id: "children",
    title: "Children’s privacy",
    paragraphs: [
      "The Service is not directed to, and we do not knowingly collect personal data from, children under the age of 18. If we become aware that we have collected personal data from a child without appropriate consent, we will take steps to delete it.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time to reflect changes to our practices or for legal, operational or regulatory reasons. We will update the “Last updated” date above when we do, and, where changes are material, provide additional notice.",
    ],
  },
  {
    id: "contact",
    title: "Contact us",
    paragraphs: [
      "For privacy questions, data requests, or to exercise any of the rights above, email privacy@myalgoagent.com or see our Contact page. MyAlgoAgent is operated by Shagoon Softech Pvt. Ltd.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Privacy Policy", url: `${siteUrl}/privacy-policy` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LegalPage
        label="Legal / Data protection"
        title="Privacy Policy"
        updated="September 2026"
        intro="A clear account of what we collect, why we need it, and the controls available to you."
        sections={sections}
        breadcrumbLabel="Privacy Policy"
        breadcrumbHref="/privacy-policy"
      />
    </>
  );
}
