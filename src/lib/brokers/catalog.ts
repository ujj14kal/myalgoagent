// Brokers users can link through their own API app. Plain data, safe to
// import on the client: the Broker Connections page renders its guides from
// here, and the server adapters (adapters.ts) implement the live ones.

export type BrokerId = "dhan" | "zerodha" | "upstox" | "fyers" | "angelone" | "groww" | "icicidirect" | "kotak" | "5paisa" | "aliceblue" | "hdfcsky" | "motilal" | "paytmmoney" | "sharekhan" | "axisdirect" | "iifl" | "mstock" | "jainam" | "smc" | "anandrathi" | "indstocks" | "nuvama";

export type BrokerField = { name: "apiKey" | "apiSecret" | "clientId"; label: string; placeholder: string; help?: string; secret?: boolean };

/**
 * A second way to do the daily login, offered next to the broker's usual one.
 * "totp": Groww's API TOTP key — we generate the code, no daily approval.
 * "phone": Upstox's access-token request — the user taps Approve in the
 * Upstox app or on WhatsApp instead of visiting a login page.
 */
export type LoginMethodId = "totp" | "phone";
export type AltLogin = {
  id: LoginMethodId;
  /** Names for the two choices, e.g. "Approve daily on Groww" / "Automatic with TOTP". */
  defaultLabel: string;
  defaultSummary: string;
  label: string;
  summary: string;
  fields: BrokerField[];
  /** PASTE_CALLBACK and PASTE_NOTIFIER are rendered with copy buttons. */
  steps: string[];
  session: string;
  /** The honest trade-off, shown before the user chooses it. */
  tradeoff: string;
  notes?: string[];
};

export type BrokerInfo = {
  id: BrokerId;
  name: string;
  logo: string;
  /** "live" = connect works today; "next" = guide shown, connecting comes in a later release. */
  availability: "live" | "next";
  /**
   * How the daily login works. "redirect" (default): the user logs in on the
   * broker's page and is sent back to our Redirect URL. "approval": no
   * redirect — the user approves the API key on the broker's site each day and
   * we fetch the day's token with a signed request (Groww).
   */
  flow?: "redirect" | "approval";
  /** Where the user creates their API app. */
  portal: { label: string; url: string };
  /** What the broker calls the field our callback URL goes into. */
  callbackFieldName: string;
  fields: BrokerField[];
  /** Step-by-step, in the broker's own menu names. The callback-URL step is rendered with a copy button. */
  steps: string[];
  cost: string;
  /** One-line API price for side-by-side comparisons. */
  apiCost: string;
  session: string;
  notes?: string[];
  altLogin?: AltLogin;
};

export const BROKERS: BrokerInfo[] = [
  {
    id: "dhan",
    name: "Dhan",
    logo: "/brokers/dhan.svg",
    availability: "live",
    portal: { label: "web.dhan.co", url: "https://web.dhan.co" },
    callbackFieldName: "Redirect URL",
    fields: [
      { name: "clientId", label: "Dhan Client ID", placeholder: "e.g. 1100012345", help: "Shown under your name in the Dhan profile menu." },
      { name: "apiKey", label: "API key", placeholder: "Paste the API key" },
      { name: "apiSecret", label: "API secret", placeholder: "Paste the API secret", secret: true },
    ],
    steps: [
      "Log in to web.dhan.co and open your Profile (top-right) → DhanHQ Trading APIs.",
      "Choose “API key” (not “Access token”), give the app any name, e.g. MyAlgoAgent.",
      "PASTE_CALLBACK",
      "Leave the Postback URL empty and click Generate. Copy the API key and API secret — Dhan shows the secret once.",
      "Paste your Dhan Client ID, API key and secret below, then click Save & log in to Dhan.",
    ],
    cost: "Trading APIs are free. Dhan’s Data APIs (live feed and history) are an optional ₹499 add-on.",
    apiCost: "Free (optional ₹499 data add-on)",
    session: "Your Dhan login lasts 24 hours — log in again from this page each trading day.",
    notes: ["The API key and secret are valid for 12 months; generate new ones on Dhan when they expire and save them here again."],
  },
  {
    id: "zerodha",
    name: "Zerodha",
    logo: "/brokers/zerodha.svg",
    availability: "live",
    portal: { label: "developers.kite.trade", url: "https://developers.kite.trade" },
    callbackFieldName: "Redirect URL",
    fields: [
      { name: "apiKey", label: "API key", placeholder: "Paste the Kite Connect API key" },
      { name: "apiSecret", label: "API secret", placeholder: "Paste the API secret", secret: true },
    ],
    steps: [
      "Sign up at developers.kite.trade (a separate developer login from Kite) and click Create new app.",
      "Pick Personal (free — orders only) or Connect (₹500/month — adds live and historical data). Enter your Zerodha Client ID and any app name.",
      "PASTE_CALLBACK",
      "Save the app, open it and copy the API key and API secret.",
      "Paste both below and click Save & log in to Zerodha.",
    ],
    cost: "Personal apps are free (no market data). The Connect plan is ₹500/month and includes live and historical data.",
    apiCost: "Free Personal app (₹500/month Connect plan adds data)",
    session: "Kite sessions end at 6 AM every day — log in again each trading day.",
  },
  {
    id: "upstox",
    name: "Upstox",
    logo: "/brokers/upstox.png",
    availability: "live",
    portal: { label: "account.upstox.com/developer/apps", url: "https://account.upstox.com/developer/apps" },
    callbackFieldName: "Redirect URL",
    fields: [
      { name: "apiKey", label: "API key", placeholder: "Paste the API key" },
      { name: "apiSecret", label: "API secret", placeholder: "Paste the API secret", secret: true },
    ],
    steps: [
      "Log in at account.upstox.com/developer/apps and click New App.",
      "Give it any name, e.g. MyAlgoAgent.",
      "PASTE_CALLBACK",
      "Leave the Postback URL empty, accept the terms and click Continue. Copy the API key and API secret.",
      "Paste both below and click Save & log in to Upstox.",
    ],
    cost: "Free, including market data for your own use.",
    apiCost: "Free",
    session: "Upstox tokens expire at 3:30 AM every day — log in again each trading day.",
    altLogin: {
      id: "phone",
      defaultLabel: "Log in on Upstox's page",
      defaultSummary: "Each day, sign in on Upstox's login page and come straight back.",
      label: "Approve on your phone",
      summary: "No login page — each day, tap Approve in the Upstox app or on WhatsApp.",
      fields: [
        { name: "apiKey", label: "API key", placeholder: "Paste the API key" },
        { name: "apiSecret", label: "API secret", placeholder: "Paste the API secret", secret: true },
      ],
      steps: [
        "Log in at account.upstox.com/developer/apps and click New App (or edit your MyAlgoAgent app).",
        "PASTE_CALLBACK",
        "PASTE_NOTIFIER",
        "Save the app and copy the API key and API secret.",
        "Paste both below and click Save & send approval. Tap Approve in the Upstox app or on WhatsApp — this page connects the moment you do.",
      ],
      session: "Upstox tokens expire at 3:30 AM — each trading day, click “Send approval to my phone” and tap Approve.",
      tradeoff: "Nothing extra is stored — you still approve every day, just with a tap on your phone instead of a login page.",
      notes: ["The notifier URL is private to your account — don't share it. If an approval never reaches us, use “Log in on Upstox's page” for that day and tell us."],
    },
  },
  {
    id: "fyers",
    name: "Fyers",
    logo: "/brokers/fyers.png",
    availability: "live",
    portal: { label: "myapi.fyers.in", url: "https://myapi.fyers.in/dashboard" },
    callbackFieldName: "Redirect URL",
    fields: [
      { name: "apiKey", label: "App ID", placeholder: "e.g. XA1B2C3D4E-100", help: "Includes the “-100” at the end." },
      { name: "apiSecret", label: "Secret ID", placeholder: "Paste the Secret ID", secret: true },
    ],
    steps: [
      "Log in at myapi.fyers.in, open the Dashboard and click Create App.",
      "Give it any name and tick the permissions you want (profile, orders, data).",
      "PASTE_CALLBACK",
      "Create the app and copy its App ID (ends in -100) and Secret ID.",
      "Paste both below and click Save & log in to Fyers.",
    ],
    cost: "Free, including market data for your own use.",
    apiCost: "Free",
    session: "Fyers tokens last for the trading day — log in again each trading day.",
  },
  {
    id: "angelone",
    name: "Angel One",
    logo: "/brokers/angelone.png",
    availability: "live",
    portal: { label: "smartapi.angelone.in", url: "https://smartapi.angelone.in" },
    callbackFieldName: "Redirect URL",
    fields: [{ name: "apiKey", label: "API key", placeholder: "Paste the SmartAPI key" }],
    steps: [
      "Sign up or log in at smartapi.angelone.in and click Create an App.",
      "Choose Trading APIs, give it any name and enter your Angel One client ID.",
      "PASTE_CALLBACK",
      "Create the app and copy its API key (the secret isn’t needed for this login).",
      "Paste the key below and click Save & log in to Angel One.",
    ],
    cost: "Free, including market data for your own use.",
    apiCost: "Free",
    session: "Angel One sessions end at midnight — log in again each trading day.",
    notes: ["Angel One doesn’t allow market orders from algos — live strategies on Angel One will send limit orders."],
  },
  {
    id: "groww",
    name: "Groww",
    logo: "/brokers/groww.png",
    availability: "live",
    flow: "approval",
    portal: { label: "groww.in/trade-api/api-keys", url: "https://groww.in/trade-api/api-keys" },
    callbackFieldName: "",
    fields: [
      { name: "apiKey", label: "API key", placeholder: "Paste the API key" },
      { name: "apiSecret", label: "API secret", placeholder: "Paste the API secret", secret: true },
    ],
    steps: [
      "Log in at groww.in/trade-api/api-keys (subscribe to Groww Trade API if asked).",
      "Click Generate API key, choose “API key & secret”, give it any name, e.g. MyAlgoAgent. No Redirect URL is needed for Groww.",
      "Copy the API key and API secret.",
      "Each trading day, click Approve next to the key on that same Groww page.",
      "Paste both keys below and click Save & connect Groww — after that, it’s one click on “Connect for today” once you’ve approved the key.",
    ],
    cost: "Groww charges a monthly fee for Trade API access — check the current price on the API keys page.",
    apiCost: "Paid Groww Trade API subscription",
    session: "Groww tokens expire at 6 AM every day — approve the key on Groww, then connect for today.",
    altLogin: {
      id: "totp",
      defaultLabel: "Approve daily on Groww",
      defaultSummary: "Each day, click Approve next to your key on Groww, then connect here.",
      label: "Automatic with TOTP",
      summary: "No daily approval — one click on “Connect for today” and you're in.",
      fields: [
        { name: "apiKey", label: "TOTP token", placeholder: "The long TOTP token (starts with eyJ…)" },
        { name: "apiSecret", label: "TOTP secret", placeholder: "The shorter code under the QR", help: "Letters A–Z and digits 2–7, about 32 characters.", secret: true },
      ],
      steps: [
        "Log in at groww.in/trade-api/api-keys (subscribe to Groww Trade API if asked).",
        "Click Generate API key and choose “TOTP”. Give it any name, e.g. MyAlgoAgent. No Redirect URL is needed.",
        "Copy the TOTP token (the long code) and the TOTP secret (the shorter code under the QR). Treat both like a password — don't screenshot or screen-share that dialog.",
        "Paste both below and click Save & connect Groww. From then on, “Connect for today” works straight away — no approval on Groww.",
      ],
      session: "Groww sessions end at 6 AM — one click on “Connect for today” starts the next one, with no approval needed.",
      tradeoff:
        "Convenient, but it removes the daily approval: anyone holding both codes could open a Groww API session. We encrypt them and never show them again, even to our team — and deleting the key on Groww cuts access instantly. This is Groww's API key, not your Groww login or its 2FA.",
    },
  },
  {
    id: "icicidirect",
    name: "ICICI Direct",
    logo: "/brokers/icicidirect.png",
    availability: "live",
    portal: { label: "api.icicidirect.com", url: "https://api.icicidirect.com/apiuser/home" },
    callbackFieldName: "Redirect URL",
    fields: [
      { name: "apiKey", label: "App key", placeholder: "Paste the Breeze App key" },
      { name: "apiSecret", label: "Secret key", placeholder: "Paste the Secret key", secret: true },
    ],
    steps: [
      "Log in at api.icicidirect.com with your ICICI Direct account and click Register an App (Breeze API).",
      "Give the app any name, e.g. MyAlgoAgent.",
      "PASTE_CALLBACK",
      "Submit, then copy the App key and Secret key shown under View Apps.",
      "Paste both below and click Save & log in to ICICI Direct.",
    ],
    cost: "Breeze API is free for ICICI Direct customers, including market data for your own use.",
    apiCost: "Free",
    session: "Breeze sessions last for the trading day — log in again each trading day.",
  },
  {
    id: "5paisa",
    name: "5paisa",
    logo: "/brokers/5paisa.png",
    availability: "live",
    portal: { label: "xstream.5paisa.com", url: "https://xstream.5paisa.com/dashboard" },
    callbackFieldName: "Redirect URL",
    fields: [
      { name: "clientId", label: "User ID", placeholder: "The API User ID", help: "From the API keys section of your Xstream dashboard — not your login ID." },
      { name: "apiKey", label: "User key", placeholder: "Paste the User Key" },
      { name: "apiSecret", label: "Encryption key", placeholder: "Paste the Encryption Key", secret: true },
    ],
    steps: [
      "Log in at xstream.5paisa.com and open the API keys section of the dashboard.",
      "Create (or view) your API keys.",
      "PASTE_CALLBACK",
      "Copy the User ID, User Key and Encryption Key shown there.",
      "Paste all three below and click Save & log in to 5paisa.",
    ],
    cost: "Trading APIs are free.",
    apiCost: "Free",
    session: "5paisa tokens expire at 11:59 PM every day — log in again each trading day.",
  },
  {
    id: "aliceblue",
    name: "Alice Blue",
    logo: "/brokers/aliceblue.png",
    availability: "live",
    portal: { label: "ant.aliceblueonline.com", url: "https://ant.aliceblueonline.com" },
    callbackFieldName: "Redirect URL",
    fields: [
      { name: "apiKey", label: "App Code", placeholder: "Paste the App Code" },
      { name: "apiSecret", label: "API Secret", placeholder: "Paste the API Secret", secret: true },
    ],
    steps: [
      "Log in to Alice Blue ANT web, open Apps → API / Developer Portal, and create an app for Individual Trader use.",
      "Give it any name, e.g. MyAlgoAgent.",
      "PASTE_CALLBACK",
      "Save, then copy the App Code and API Secret.",
      "Paste both below and click Save & log in to Alice Blue.",
    ],
    cost: "Trading APIs are free.",
    apiCost: "Free",
    session: "Alice Blue sessions last for the trading day — log in again each trading day.",
  },
  {
    id: "kotak",
    name: "Kotak Neo",
    logo: "/brokers/kotak.svg",
    availability: "next",
    portal: { label: "kotakneo.com", url: "https://www.kotakneo.com/platform/kotak-neo-trade-api/" },
    callbackFieldName: "Redirect URL",
    fields: [],
    steps: [
      "In the Kotak Neo app or web, open Invest → Trade API and create an application to get your consumer key.",
      "Register TOTP for your account in an authenticator app — Kotak’s API login needs it.",
      "Keep the consumer key safe. Connecting Kotak Neo on this page is coming next.",
    ],
    cost: "Kotak Neo Trade API is free.",
    apiCost: "Free",
    session: "Like every broker, you’ll log in again each trading day.",
    notes: ["Kotak’s API login uses a TOTP code and your MPIN rather than a redirect to Kotak’s page, so it needs a different, extra-careful login step here."],
  },
  {
    id: "hdfcsky",
    name: "HDFC Securities (HDFC Sky)",
    logo: "/brokers/hdfcsky.svg",
    availability: "next",
    portal: { label: "developer.hdfcsky.com", url: "https://developer.hdfcsky.com" },
    callbackFieldName: "Redirect URL",
    fields: [],
    steps: [
      "Sign in at developer.hdfcsky.com with your HDFC Sky client ID and the OTP.",
      "Open My Apps → + Create. Give the app a name, paste our Redirect URL and your static IP, then save.",
      "Copy the API key and API secret that appear. Connecting HDFC Securities on this page is coming next.",
    ],
    cost: "The HDFC Sky Open API is free for HDFC Sky clients.",
    apiCost: "Free",
    session: "HDFC Sky sessions last for the trading day — you log in again each trading day.",
    notes: ["HDFC Sky needs a static IP registered on the app, as SEBI's rules require. Your IP is shown on Live Trading once you're on a paid plan."],
  },
  {
    id: "motilal",
    name: "Motilal Oswal",
    logo: "/brokers/motilal.svg",
    availability: "next",
    portal: { label: "Motilal Oswal Open API", url: "https://invest.motilaloswal.com/moapi/APIDocumentation/Introduction" },
    callbackFieldName: "Redirect URL",
    fields: [],
    steps: [
      "Sign in to the Motilal Oswal API portal with your trading credentials.",
      "Go to My APIs, set up the authenticator (TOTP), and create an API key. Paste our Redirect URL when asked.",
      "Keep the API key and secret safe. Connecting Motilal Oswal on this page is coming next.",
    ],
    cost: "Motilal Oswal's trading API is free for clients.",
    apiCost: "Free",
    session: "Motilal Oswal sessions end every morning at 6 a.m. — you log in again each trading day.",
    notes: ["Keys you create yourself on the portal are activated automatically. Older keys may need an email to Motilal's API team."],
  },
  {
    id: "paytmmoney",
    name: "Paytm Money",
    logo: "/brokers/paytmmoney.svg",
    availability: "next",
    portal: { label: "developer.paytmmoney.com", url: "https://developer.paytmmoney.com" },
    callbackFieldName: "Redirect URL",
    fields: [],
    steps: [
      "Sign in at developer.paytmmoney.com with your registered mobile number or email.",
      "Create an app (you can have up to five) and paste our Redirect URL.",
      "Copy the API key and API secret from the dashboard. Connecting Paytm Money on this page is coming next.",
    ],
    cost: "Paytm Money's Open API is free.",
    apiCost: "Free",
    session: "Paytm Money sessions last for the trading day — you log in again each trading day.",
    notes: ["You need a KYC-complete equity account at Paytm Money to create keys."],
  },
  {
    id: "sharekhan",
    name: "Mirae Asset Sharekhan",
    logo: "/brokers/sharekhan.svg",
    availability: "next",
    portal: { label: "sharekhan.com/trading-api", url: "https://www.sharekhan.com/trading-api" },
    callbackFieldName: "Redirect URL",
    fields: [],
    steps: [
      "Sign in at sharekhan.com/trading-api and switch the API on under the Login option.",
      "Copy the API key and the secure key it gives you.",
      "Keep them safe. Connecting Sharekhan on this page is coming next.",
    ],
    cost: "Sharekhan's trading API is free for active customers.",
    apiCost: "Free",
    session: "Sharekhan sessions last for the trading day — you log in again each trading day.",
    notes: ["Sharekhan publishes its code samples on GitHub (github.com/Sharekhan)."],
  },
  {
    id: "axisdirect",
    name: "Axis Securities (Axis Direct)",
    logo: "/brokers/axisdirect.svg",
    availability: "next",
    portal: { label: "simplehai.axisdirect.in/RapidAPI", url: "https://simplehai.axisdirect.in/RapidAPI" },
    callbackFieldName: "Redirect URL",
    fields: [],
    steps: [
      "Open Axis Direct's RAPID API page and request API access — keys are sent by email.",
      "Write to api@axissecurities.in if the keys don't arrive.",
      "Keep the keys safe. Connecting Axis Direct on this page is coming next.",
    ],
    cost: "Axis Direct's RAPID API is free; normal brokerage applies.",
    apiCost: "Free",
    session: "Axis Direct sessions last for the trading day — you log in again each trading day.",
    notes: ["Axis Direct hands out keys by request rather than from a self-service page."],
  },
  {
    id: "iifl",
    name: "IIFL Capital",
    logo: "/brokers/iifl.svg",
    availability: "next",
    portal: { label: "developers.iiflcapital.com", url: "https://developers.iiflcapital.com" },
    callbackFieldName: "Redirect URL",
    fields: [],
    steps: [
      "In IIFL Markets open Trading Preferences → Trading API and press Generate.",
      "Copy the API key and secret. They stay valid for 6 months, then must be regenerated.",
      "Register your static IP if asked. Connecting IIFL Capital on this page is coming next.",
    ],
    cost: "IIFL Capital's trading API is free.",
    apiCost: "Free",
    session: "IIFL sessions last for the trading day — you log in again each trading day.",
    notes: ["IIFL only accepts calls from the IP you register, so a static IP is needed."],
  },
  {
    id: "mstock",
    name: "m.Stock (Mirae Asset)",
    logo: "/brokers/mstock.svg",
    availability: "next",
    portal: { label: "mstock.com/trading-api", url: "https://www.mstock.com/trading-api" },
    callbackFieldName: "Redirect URL",
    fields: [],
    steps: [
      "Open the Trading API page on mstock.com and generate your API key from your account.",
      "Copy the key and secret.",
      "Keep them safe. Connecting m.Stock on this page is coming next.",
    ],
    cost: "m.Stock's trading API and data API are free.",
    apiCost: "Free",
    session: "m.Stock sessions last for the trading day — you log in again each trading day.",
    notes: ["m.Stock lists up to 30 orders a second on its API."],
  },
  {
    id: "jainam",
    name: "Jainam Broking",
    logo: "/brokers/jainam.svg",
    availability: "next",
    portal: { label: "jainam.in/product/jainam-api", url: "https://www.jainam.in/product/jainam-api/" },
    callbackFieldName: "Redirect URL",
    fields: [],
    steps: [
      "On Jainam's API page choose Get API and submit the form to receive the documents.",
      "Create the order app and the market-data app in your Jainam dashboard and wait for approval.",
      "Copy the keys once both are Active. Connecting Jainam on this page is coming next.",
    ],
    cost: "Jainam's API is free.",
    apiCost: "Free",
    session: "Jainam sessions last for the trading day — you log in again each trading day.",
    notes: ["Jainam's API is built on the XTS standard and needs two approved apps (orders and market data)."],
  },
  {
    id: "smc",
    name: "SMC Global Securities",
    logo: "/brokers/smc.svg",
    availability: "next",
    portal: { label: "SMC ACE API", url: "https://smcaceapi.smctradeonline.com/api-documentation" },
    callbackFieldName: "Redirect URL",
    fields: [],
    steps: [
      "Open SMC's ACE API documentation and request API access from your SMC account.",
      "Register our Redirect URL for your app.",
      "Copy the API key and secret key. Connecting SMC on this page is coming next.",
    ],
    cost: "SMC's ACE API is free.",
    apiCost: "Free",
    session: "SMC sessions last for the trading day — you log in again each trading day.",
    notes: ["Check SMC's current terms when you apply — these details come from SMC's public pages."],
  },
  {
    id: "anandrathi",
    name: "Anand Rathi",
    logo: "/brokers/anandrathi.svg",
    availability: "next",
    portal: { label: "anandrathi.com/algozy", url: "https://anandrathi.com/algozy" },
    callbackFieldName: "Redirect URL",
    fields: [],
    steps: [
      "Open Anand Rathi's Algozy page and request API access for your account.",
      "Create your order app and your market-data app.",
      "Copy the keys. Connecting Anand Rathi on this page is coming next.",
    ],
    cost: "Anand Rathi's Algozy API is free.",
    apiCost: "Free",
    session: "Anand Rathi sessions last for the trading day — you log in again each trading day.",
    notes: ["Anand Rathi lists up to 10 orders a second on its order API."],
  },
  {
    id: "indstocks",
    name: "INDstocks (INDmoney)",
    logo: "/brokers/indstocks.svg",
    availability: "next",
    portal: { label: "api-docs.indstocks.com", url: "https://api-docs.indstocks.com/getting-started/" },
    callbackFieldName: "Redirect URL",
    fields: [],
    steps: [
      "Sign in at indstocks.com and open the access-tokens page. Choose Claim Your API Access.",
      "Generate your access token. INDstocks tokens last 24 hours, so you generate a fresh one each trading day.",
      "Set up TOTP and your static IP on the same page. Connecting INDstocks on this page is coming next.",
    ],
    cost: "INDstocks' trading API is free to use; check INDstocks for any per-order charge.",
    apiCost: "Free (check per-order charge)",
    session: "INDstocks tokens expire after 24 hours — you add a fresh one each trading day.",
    notes: ["INDstocks asks for a static IP to be registered before its API will accept your calls."],
  },
  {
    id: "nuvama",
    name: "Nuvama Wealth",
    logo: "/brokers/nuvama.svg",
    availability: "next",
    portal: { label: "nuvamawealth.com/docs", url: "https://www.nuvamawealth.com/docs/" },
    callbackFieldName: "Redirect URL",
    fields: [],
    steps: [
      "Open Nuvama's API Connect documentation and request API access for your account.",
      "Complete the OAuth app setup and register our Redirect URL.",
      "Copy the API key and secret. Connecting Nuvama on this page is coming next.",
    ],
    cost: "Nuvama's API Connect has been free in its launch year; check the current terms.",
    apiCost: "Free (launch offer)",
    session: "Nuvama sessions last for the trading day — you log in again each trading day.",
    notes: ["Nuvama's pricing may change after its launch year."],
  },
];

export const LIVE_BROKER_IDS = BROKERS.filter((b) => b.availability === "live").map((b) => b.id);

export function brokerById(id: string): BrokerInfo | undefined {
  return BROKERS.find((b) => b.id === id);
}

/** The URL a user pastes into their broker app. Same for every user of a broker; the login it completes is tied to the signed-in user. */
export function callbackUrl(origin: string, broker: BrokerId): string {
  return `${origin.replace(/\/$/, "")}/api/brokers/${broker}/callback`;
}

/** Where Upstox sends an approved token for this user (the token part is private to them). */
export function notifierUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/api/brokers/upstox/notifier/${token}`;
}

/** The fields, steps and daily-login text for the method the user picked (null = the broker's usual login). */
export function loginView(info: BrokerInfo, method: LoginMethodId | null | undefined) {
  const alt = method && info.altLogin?.id === method ? info.altLogin : null;
  return {
    method: alt ? alt.id : null,
    fields: alt ? alt.fields : info.fields,
    steps: alt ? alt.steps : info.steps,
    session: alt ? alt.session : info.session,
    notes: [...(info.notes ?? []), ...(alt?.notes ?? [])],
  };
}
