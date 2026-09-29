import { BellRing, ClipboardCopy, FileCheck2, LineChart, ShieldCheck } from "lucide-react";

const STEPS = [
  {
    icon: FileCheck2,
    title: "Create the strategy here",
    body: "Build with: Webhook. Choose the stock, Buy or Sell direction, position size and your stop-loss / target, then press Create.",
  },
  {
    icon: ClipboardCopy,
    title: "Copy your private webhook URL",
    body: "The strategy's page shows it under Webhook setup. It's shown only once — copy it straight away (you can always regenerate a new one).",
  },
  {
    icon: BellRing,
    title: "Create an alert in TradingView",
    body: "On your chart, open Alerts → Create alert and set the condition from your own indicator or strategy. In Notifications, tick Webhook URL and paste the URL. In Message, type BUY for the alert that opens a trade — and make a second alert with SELL to close it.",
  },
  {
    icon: LineChart,
    title: "MyAlgoAgent follows the alerts",
    body: "BUY opens the position and SELL closes it, at the latest price (a short strategy is the reverse). Your stop-loss and target still apply while it's open. Every alert is listed under Recent signals — including any we couldn't read, with the reason.",
  },
  {
    icon: ShieldCheck,
    title: "Watch the results as a forward test",
    body: "Trades are hypothetical — no real money and no broker orders. Check how it behaves over time before you decide anything else.",
  },
];

/** Plain-language walkthrough of webhook strategies, for people new to them. */
export default function WebhookGuide({ open = false }: { open?: boolean }) {
  return (
    <details open={open} className="group rounded-xl bg-brand-bg/70 p-4 ring-1 ring-black/[0.04]">
      <summary className="cursor-pointer list-none text-sm font-semibold text-brand-navy">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> New to webhooks? How it works
      </summary>
      <p className="mt-2 text-sm text-brand-navy/65">
        You already have a trading idea running in TradingView. Instead of rebuilding its rules here, MyAlgoAgent follows the alerts TradingView sends.{" "}
        <strong className="text-brand-navy">TradingView decides when; MyAlgoAgent handles how much and the risk</strong> — and your private webhook URL connects the two.
      </p>
      <ol className="mt-3 space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-brand-primary ring-1 ring-brand-primary/20">
              <s.icon size={14} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-brand-navy">
                {i + 1}. {s.title}
              </span>
              <span className="block text-xs leading-relaxed text-brand-navy/65">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-brand-navy/50">
        Use alerts from a strategy you wrote or understand yourself. Keep the URL private — anyone with it can send signals to this strategy (regenerate it if it leaks).
      </p>
    </details>
  );
}
