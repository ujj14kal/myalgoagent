import Link from "next/link";
import { Bot, ThumbsDown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/admin/access";
import { perDay } from "@/lib/admin/stats";
import { AdminPageHeader, Bars, Card, Empty, Kpi, Pill, ago } from "@/components/admin/ui";
import { daysAgo } from "@/lib/admin/time";


// Bedrock on-demand list prices (USD per million tokens), for an estimate only.
const PRICE: Record<string, { in: number; out: number }> = {
  "mantle:openai.gpt-oss-120b": { in: 0.15, out: 0.6 },
  "mantle:openai.gpt-oss-20b": { in: 0.07, out: 0.3 },
};

export default async function AiPage() {
  await requireStaff("ai");
  const since30 = daysAgo(30);
  const [questions30, users30, byModel, guardrail30, ratings, daily, downvoted] = await Promise.all([
    prisma.agentMessage.count({ where: { role: "USER", createdAt: { gte: since30 } } }),
    prisma.agentConversation.groupBy({ by: ["userId"], where: { updatedAt: { gte: since30 } } }).then((r) => r.length),
    prisma.agentMessage.groupBy({ by: ["model"], where: { role: "ASSISTANT", createdAt: { gte: since30 } }, _count: true, _sum: { inputTokens: true, outputTokens: true }, _avg: { latencyMs: true } }),
    prisma.agentMessage.count({ where: { guardrailHit: true, createdAt: { gte: since30 } } }),
    prisma.agentMessage.groupBy({ by: ["rating"], where: { rating: { not: null }, createdAt: { gte: since30 } }, _count: true }),
    perDay("AgentMessage", "createdAt", 30),
    // Only replies the user chose to rate 👎 are reviewed (the privacy policy says so).
    prisma.agentMessage.findMany({
      where: { rating: -1 },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, content: true, createdAt: true, model: true, conversationId: true, conversation: { select: { userId: true, user: { select: { email: true } } } } },
    }),
  ]);

  const questions = await Promise.all(
    downvoted.map((d) =>
      prisma.agentMessage.findFirst({ where: { conversationId: d.conversationId, role: "USER", createdAt: { lt: d.createdAt } }, orderBy: { createdAt: "desc" }, select: { content: true } }),
    ),
  );

  const tokensIn = byModel.reduce((a, m) => a + (m._sum.inputTokens ?? 0), 0);
  const tokensOut = byModel.reduce((a, m) => a + (m._sum.outputTokens ?? 0), 0);
  const cost = byModel.reduce((a, m) => {
    const p = PRICE[m.model ?? ""] ?? PRICE["mantle:openai.gpt-oss-120b"];
    return a + ((m._sum.inputTokens ?? 0) * p.in + (m._sum.outputTokens ?? 0) * p.out) / 1e6;
  }, 0);
  const replies = byModel.reduce((a, m) => a + m._count, 0);
  const latency = replies ? byModel.reduce((a, m) => a + (m._avg.latencyMs ?? 0) * m._count, 0) / replies : 0;
  const up = ratings.find((r) => r.rating === 1)?._count ?? 0;
  const down = ratings.find((r) => r.rating === -1)?._count ?? 0;

  return (
    <div className="space-y-5">
      <AdminPageHeader title="AI agent" icon={Bot} description="How users use their agent over the last 30 days — volume, cost, speed, safety and quality." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Questions" value={questions30.toLocaleString("en-IN")} hint={`from ${users30} user${users30 === 1 ? "" : "s"}`} spark={daily.map((d) => d.value)} />
        <Kpi label="Est. cost" value={`$${cost.toFixed(2)}`} hint={`${((tokensIn + tokensOut) / 1000).toFixed(0)}k tokens · ~$${replies ? (cost / replies).toFixed(4) : "0"}/reply`} />
        <Kpi label="Avg reply time" value={`${(latency / 1000).toFixed(1)}s`} tone={latency > 12_000 ? "warn" : "good"} />
        <Kpi label="Guardrail blocks" value={guardrail30} hint="advice requests stopped" />
        <Kpi label="Ratings" value={`👍 ${up} · 👎 ${down}`} hint={up + down ? `${Math.round((up / (up + down)) * 100)}% helpful` : "no ratings yet"} tone={down > up ? "warn" : "good"} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Questions per day" className="lg:col-span-2">
          <Bars data={daily} color="var(--brand-gold)" />
        </Card>
        <Card title="Models">
          {byModel.length === 0 ? (
            <p className="text-sm text-brand-navy/45">No replies yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {byModel.map((m) => (
                <li key={m.model ?? "unknown"} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-brand-navy/70">{(m.model ?? "unknown").replace("mantle:", "")}</span>
                  <Pill tone="purple">{m._count}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title="Replies users rated 👎" icon={ThumbsDown} pad={false}>
        {downvoted.length === 0 ? (
          <Empty>No thumbs-down yet.</Empty>
        ) : (
          <ul className="divide-y divide-black/[0.05]">
            {downvoted.map((d, k) => (
              <li key={d.id} className="space-y-2 px-5 py-4">
                <p className="text-[11px] text-brand-navy/40">
                  {ago(d.createdAt)} · {d.model?.replace("mantle:", "") ?? "model"} ·{" "}
                  <Link href={`/admin/users/${d.conversation.userId}`} className="text-brand-primary/80">
                    {d.conversation.user.email}
                  </Link>
                </p>
                {questions[k] && <p className="rounded-xl bg-brand-bg px-3 py-2 text-sm text-brand-navy/80">Q: {questions[k]!.content.slice(0, 400)}</p>}
                <p className="whitespace-pre-wrap rounded-xl bg-brand-sell/[0.04] px-3 py-2 text-sm text-brand-navy/80 ring-1 ring-brand-sell/10">{d.content.slice(0, 900)}{d.content.length > 900 ? "…" : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
