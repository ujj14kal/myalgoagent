// Ready-made replies for common questions. {name} is replaced with the
// person's first name. Keep these factual and free of investment advice.

export const CANNED_REPLIES: { label: string; body: string }[] = [
  {
    label: "Thanks — looking into it",
    body: "Hi {name},\n\nThanks for getting in touch. I'm looking into this now and will update you here as soon as I know more.",
  },
  {
    label: "Thanks for the feedback",
    body: "Hi {name},\n\nThank you for taking the time to send this — it's been shared with the product team. We read every piece of feedback, and it genuinely shapes what we build next.",
  },
  {
    label: "Broker keys rejected",
    body: "Hi {name},\n\nYour broker didn't accept the API key and secret that were saved. The usual causes are a key that was regenerated or deleted on the broker's site, or a Redirect URL that doesn't match exactly.\n\nOpen Broker Connections, click your broker, and paste the current key and secret from the broker's developer page. The guide on that page shows the exact Redirect URL to use.",
  },
  {
    label: "Daily broker login",
    body: "Hi {name},\n\nBroker sessions end every day — that's a broker and SEBI rule, not something we can extend. Each trading day, open Broker Connections and click “Log in again”; you'll sign in on your broker's own page (your password, PIN and TOTP stay with the broker) and come straight back. Your API keys stay saved, so you don't need to paste them again.",
  },
  {
    label: "Not investment advice",
    body: "Hi {name},\n\nWe're not able to recommend what to buy or sell, or predict returns — MyAlgoAgent is a tool for building and testing your own strategies. What I can do is help you set up and test the rules you have in mind. Could you tell me a little more about the strategy you'd like to build?",
  },
  {
    label: "Resolved — closing",
    body: "Hi {name},\n\nGlad that's sorted. I'll mark this as resolved — if anything else comes up, just reply here and it'll reopen straight away.",
  },
];
