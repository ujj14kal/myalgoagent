import { notFound } from "next/navigation";
import Pager from "@/components/ui/pager";
import ListTabs from "@/components/ui/list-tabs";
import ListToolbar from "@/components/ui/list-toolbar";
import { readPageQuery } from "@/lib/pagination";
import { keepParams, pageRows, qEnum, qText } from "@/lib/list-query";

// Development only: the shared list controls (tabs, search, filters, sort, pager) on a made-up list,
// to check that every setting lands in the URL and survives the others. Not served in production.

export const dynamic = "force-dynamic";

const ROWS = Array.from({ length: 137 }, (_, i) => ({ id: i + 1, name: `${["Alpha", "Beta", "Gamma", "Delta"][i % 4]} strategy ${i + 1}`, status: i % 3 === 0 ? "ACTIVE" : "DRAFT", side: i % 2 ? "BUY" : "SELL" }));

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const tab = qEnum(sp.tab, ["ACTIVE", "DRAFT"] as const, "ACTIVE");
  const q = qText(sp.q);
  const side = qEnum(sp.side, ["all", "BUY", "SELL"] as const, "all");
  const sort = qEnum(sp.sort, ["id", "name"] as const, "id");
  const filtered = ROWS.filter((r) => (!q || r.name.toLowerCase().includes(q.toLowerCase())) && (side === "all" || r.side === side));
  const inTab = filtered.filter((r) => r.status === tab).sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : a.id - b.id));
  const { page, size } = readPageQuery(sp);
  const shown = pageRows(inTab, page, size);
  const params = keepParams({ tab: tab === "ACTIVE" ? undefined : tab, q, side: side === "all" ? undefined : side, sort: sort === "id" ? undefined : sort, size: size === 25 ? undefined : String(size) });
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4">
      <ListTabs basePath="/dev/lists" params={params} tabs={[{ value: "ACTIVE", label: "Active", count: filtered.filter((r) => r.status === "ACTIVE").length }, { value: "DRAFT", label: "Drafts", count: filtered.filter((r) => r.status === "DRAFT").length }]} active={tab} />
      <ListToolbar
        params={params}
        search={{ placeholder: "Search…" }}
        selects={[
          { name: "side", label: "Side", options: [{ value: "all", label: "Any" }, { value: "BUY", label: "Buy" }, { value: "SELL", label: "Sell" }] },
          { name: "sort", label: "Sort", options: [{ value: "id", label: "Oldest" }, { value: "name", label: "Name" }] },
        ]}
      />
      <ul data-testid="rows" className="surface divide-y divide-black/[0.05]">
        {shown.rows.map((r) => (
          <li key={r.id} className="px-4 py-2 text-sm">
            {r.name} · {r.side}
          </li>
        ))}
      </ul>
      <Pager basePath="/dev/lists" params={params} window={shown.win} />
    </main>
  );
}
