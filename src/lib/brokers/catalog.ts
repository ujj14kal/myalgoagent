// Brokers users can link through their own API app. Plain data, safe to
// import on the client: the Broker Connections page renders its guides from
// here, and the server adapters (adapters.ts) implement the live ones.

export type BrokerId = "dhan" | "zerodha" | "upstox" | "fyers" | "angelone" | "groww" | "icicidirect" | "kotak" | "5paisa" | "aliceblue";

export type BrokerField = { name: "apiKey" | "apiSecret" | "clientId"; label: string; placeholder: string; help?: string; secret?: boolean };

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
];

export const LIVE_BROKER_IDS = BROKERS.filter((b) => b.availability === "live").map((b) => b.id);

export function brokerById(id: string): BrokerInfo | undefined {
  return BROKERS.find((b) => b.id === id);
}

/** The URL a user pastes into their broker app. Same for every user of a broker; the login it completes is tied to the signed-in user. */
export function callbackUrl(origin: string, broker: BrokerId): string {
  return `${origin.replace(/\/$/, "")}/api/brokers/${broker}/callback`;
}
