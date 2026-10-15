import { Library } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import Pager from "@/components/ui/pager";
import LibraryCard, { type LibraryItem } from "@/components/custom-indicators/library-card";
import ListToolbar from "@/components/ui/list-toolbar";
import { describeCustom, type CustomIndicatorDef } from "@/lib/custom-indicator";
import { averageRating } from "@/lib/custom-indicator/community";
import { readPageQuery } from "@/lib/pagination";
import { keepParams, pageRows, qEnum, qText } from "@/lib/list-query";

export const metadata = { title: "Indicator library", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const q = qText(sp.q)?.toLowerCase();
  const sort = qEnum(sp.sort, ["new", "top", "added"] as const, "new");
  const rows = await prisma.communityIndicator.findMany({
    where: { status: "PUBLISHED" },
    orderBy: sort === "added" ? { installs: "desc" } : { createdAt: "desc" },
    take: 500,
    include: { ratings: { where: { userId }, select: { stars: true } } },
  });
  const items: LibraryItem[] = rows
    .map((r) => {
      const def = r.def as unknown as CustomIndicatorDef;
      return {
        id: r.id,
        name: r.name,
        author: r.authorName,
        description: r.description,
        limitations: r.limitations,
        summary: describeCustom(def),
        repaints: r.repaints,
        integrityNote: r.integrityNote,
        timing: Array.isArray(r.timing) ? (r.timing as unknown as string[]) : [],
        installs: r.installs,
        average: averageRating(r.ratingSum, r.ratingCount),
        ratings: r.ratingCount,
        mine: r.authorId === userId,
        myStars: r.ratings[0]?.stars ?? null,
      };
    })
    .filter((i) => !q || `${i.name} ${i.description} ${i.summary} ${i.author}`.toLowerCase().includes(q));
  if (sort === "top") items.sort((a, b) => (b.average ?? 0) - (a.average ?? 0) || b.ratings - a.ratings);
  const { page, size } = readPageQuery(sp, 10);
  const shown = pageRows(items, page, size);
  const params = keepParams({ q: qText(sp.q), sort: sort === "new" ? undefined : sort, size: size === 10 ? undefined : String(size) });

  return (
    <div className="space-y-5">
      <PageHeader title="Indicator library" icon={Library} description="Indicators other users published. Every one shows its author, its formula and the result of its repainting check. Adding one gives you your own copy to test and use." />
      <p className="rounded-xl bg-brand-gold/10 px-4 py-3 text-xs leading-relaxed text-brand-navy/70 ring-1 ring-brand-gold/25">
        Community indicators are written by other users, not by MyAlgoAgent, and are not reviewed before they appear. They are tools for reading a chart, not recommendations: test any of them on your own before you use it in a strategy, and remember that past results don&apos;t predict future ones. You can report anything that looks wrong.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ListToolbar
          basePath="/app/indicators/library"
          params={params}
          search={{ placeholder: "Search name, author or formula…" }}
          selects={[{ name: "sort", label: "Sort", options: [{ value: "new", label: "Newest" }, { value: "top", label: "Best rated" }, { value: "added", label: "Most added" }] }]}
        />
        <Link href="/app/indicators" className="text-xs font-semibold text-brand-primary hover:underline">
          ← Your indicators
        </Link>
      </div>
      {shown.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-black/10 px-4 py-10 text-center text-sm text-brand-navy/50">{q ? "Nothing matches." : "Nothing has been published yet. Publish one of yours from the Custom Indicators page."}</p>
      ) : (
        shown.rows.map((i) => <LibraryCard key={i.id} item={i} />)
      )}
      <Pager basePath="/app/indicators/library" params={params} window={shown.win} />
    </div>
  );
}
