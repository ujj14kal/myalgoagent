// Every way a broker connection can fail, in plain English with what to do
// next. Client-safe: the server stores only { code, detail } and the page
// renders the explanation from here.

export type FailureCode =
  | "cancelled"
  | "approval_needed"
  | "bad_keys"
  | "missing_client_id"
  | "redirect_mismatch"
  | "code_expired"
  | "login_timeout"
  | "state_mismatch"
  | "no_login_started"
  | "no_code"
  | "session_rejected"
  | "session_ended"
  | "unreachable"
  | "not_signed_in"
  | "not_ready"
  | "rate_limited"
  | "unknown";

export type Failure = { code: FailureCode; /** The broker's own words, when it gave any. */ detail?: string };

export type FailureText = {
  title: string;
  reason: string;
  steps: string[];
  /** The right next move: a fresh broker login, new keys, wait, or sign in. */
  retry: "login" | "keys" | "later" | "signin";
};

export function describeFailure(f: Failure, broker: string): FailureText {
  switch (f.code) {
    case "cancelled":
      return {
        title: "The login was cancelled",
        reason: `The ${broker} login page was closed or cancelled before it finished, so ${broker} didn't give us access.`,
        steps: ["Click “Try again”.", `Log in on ${broker}’s page with your password and 2FA, and approve access when asked.`],
        retry: "login",
      };
    case "approval_needed":
      return {
        title: `Approve your key on ${broker} first`,
        reason: `${broker} only issues today’s session after you approve your API key on its website. It hasn’t been approved yet today — or the key or secret doesn’t match.`,
        steps: [
          `Open ${broker === "Groww" ? "groww.in/trade-api/api-keys" : `${broker}’s API keys page`} and click Approve next to your key.`,
          "Come back and click “Try again”.",
          "If it still fails, copy the API key and secret again and use “Replace keys”.",
        ],
        retry: "login",
      };
    case "bad_keys":
      return {
        title: `${broker} didn’t accept your API keys`,
        reason: `The API key or secret you pasted doesn’t match an active app on your ${broker} account. Usually a character was missed while copying, or the keys were regenerated on ${broker}.`,
        steps: [
          `Open your app on ${broker}’s developer page and copy the API key and secret again.`,
          "Click “Replace keys” here, paste them without spaces, and save.",
          `If you regenerated the keys on ${broker}, only the newest pair works.`,
        ],
        retry: "keys",
      };
    case "missing_client_id":
      return {
        title: `Your ${broker} Client ID is missing or wrong`,
        reason: `${broker} needs your Client ID together with the API key to start the login.`,
        steps: [`Find your Client ID in ${broker}’s profile menu.`, "Click “Replace keys”, enter it with the key and secret, and save."],
        retry: "keys",
      };
    case "redirect_mismatch":
      return {
        title: "The Redirect URL doesn’t match",
        reason: `The Redirect URL saved in your ${broker} app isn’t exactly the one MyAlgoAgent gave you, so ${broker} refused to send you back.`,
        steps: [
          "Copy the Redirect URL from the Broker Connections page with the Copy button.",
          `Paste it into the Redirect URL field of your app on ${broker} — no extra slash at the end, no spaces — and save the app.`,
          "Come back and click “Try again”.",
        ],
        retry: "login",
      };
    case "code_expired":
      return {
        title: "The one-time login code expired",
        reason: `${broker} sends back a code that works only once and only for a short time. It had already expired or been used — this happens if the page was refreshed or opened twice.`,
        steps: ["Click “Try again” and finish the login in one go."],
        retry: "login",
      };
    case "login_timeout":
      return {
        title: "The login took too long",
        reason: "For your safety, a broker login has to finish within 10 minutes of starting it here.",
        steps: [`Click “Try again” and complete the ${broker} login straight away.`],
        retry: "login",
      };
    case "state_mismatch":
      return {
        title: "This login didn’t match the one you started",
        reason: "The response belonged to a different login attempt — usually one started in another tab or window. We blocked it to keep your account safe.",
        steps: ["Close any other MyAlgoAgent or broker login tabs.", "Click “Try again” and finish the login in this tab."],
        retry: "login",
      };
    case "no_login_started":
      return {
        title: "No login was started from this account",
        reason: `We received a ${broker} login we weren’t expecting — for example if you’re signed in to a different MyAlgoAgent account, or opened an old link.`,
        steps: ["Make sure you’re signed in to the right MyAlgoAgent account.", "Click “Try again” to start the connection from here."],
        retry: "login",
      };
    case "no_code":
      return {
        title: `${broker} didn’t send a login code back`,
        reason: `You came back from ${broker} without the code we need. Usually the login was cancelled, or your ${broker} app isn’t set up with our Redirect URL.`,
        steps: [`Check that your ${broker} app’s Redirect URL is exactly the one on the Broker Connections page.`, "Click “Try again”."],
        retry: "login",
      };
    case "session_rejected":
      return {
        title: `${broker} rejected the session`,
        reason: `The login finished, but ${broker} refused our first check of your account. The app may be inactive or missing permissions${broker === "Zerodha" ? ", or your Kite Connect subscription may have lapsed" : ""}.`,
        steps: [`Open your app on ${broker}’s developer page and make sure it’s active with the needed permissions.`, "Click “Try again”."],
        retry: "login",
      };
    case "session_ended":
      return {
        title: `Today’s ${broker} session has ended`,
        reason: "Brokers end API sessions every day by exchange rule. Your keys are still saved.",
        steps: [`Click “Log in to ${broker}” to start today’s session.`],
        retry: "login",
      };
    case "unreachable":
      return {
        title: `Couldn’t reach ${broker}`,
        reason: `${broker}’s servers didn’t answer in time. This is usually a brief outage or maintenance on their side — nothing is wrong with your setup.`,
        steps: ["Wait a minute, then click “Try again”."],
        retry: "later",
      };
    case "not_signed_in":
      return {
        title: "You were signed out",
        reason: "We need to know which MyAlgoAgent account this broker login belongs to.",
        steps: ["Sign in to MyAlgoAgent, open Broker Connections and start the connection again."],
        retry: "signin",
      };
    case "not_ready":
      return {
        title: "Connecting isn’t switched on yet",
        reason: "Broker connections are being enabled on our side right now.",
        steps: ["Please try again a little later — your broker app setup stays valid."],
        retry: "later",
      };
    case "rate_limited":
      return {
        title: "Too many attempts",
        reason: "There were a lot of connection attempts in a short time, so we paused them briefly.",
        steps: ["Wait a minute, then try again."],
        retry: "later",
      };
    default:
      return {
        title: "Something went wrong",
        reason: `The connection to ${broker} didn’t complete, and ${broker} didn’t say why.`,
        steps: ["Click “Try again”.", "If it keeps happening, re-check the Redirect URL and your keys, or contact support."],
        retry: "login",
      };
  }
}

/** Best guess at the cause from a broker's own error text. */
export function classifyBrokerMessage(message: string | undefined, fallback: FailureCode): FailureCode {
  const m = (message ?? "").toLowerCase();
  if (!m) return fallback;
  if (/redirect/.test(m)) return "redirect_mismatch";
  if (/approv/.test(m)) return "approval_needed";
  if (/(expired|already used|invalid|incorrect).{0,30}(code|request_token|tokenid|token id|auth_code)|(code|request_token|tokenid|auth_code).{0,30}(expired|invalid)/.test(m)) return "code_expired";
  if (/client.?id|dhanclientid/.test(m) && !/client_id=|invalid_client/.test(m)) return "missing_client_id";
  if (/api.?key|secret|app.?id|invalid_client|client_id|checksum|unauthori[sz]ed|invalid credentials|appidhash/.test(m)) return "bad_keys";
  return fallback;
}

/** Stored in BrokerConnection.lastError. */
export const encodeFailure = (f: Failure) => JSON.stringify(f);

export function decodeFailure(stored: string | null | undefined): Failure | null {
  if (!stored) return null;
  try {
    const f = JSON.parse(stored) as Failure;
    if (f && typeof f.code === "string") return f;
  } catch {
    // Older plain-text value.
  }
  return { code: "unknown", detail: stored };
}
