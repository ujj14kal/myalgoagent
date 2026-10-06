import Link from "next/link";

// Tabs over one list (e.g. Active / Drafts / Archived), each with its count. Switching tab keeps the
// search, filters, sort and page size, and goes back to page 1.

export default function ListTabs({
  basePath,
  params,
  name = "tab",
  tabs,
  active,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  name?: string;
  tabs: { value: string; label: string; count?: number }[];
  active: string;
}) {
  const href = (value: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, page: undefined, [name]: value === tabs[0]?.value ? undefined : value })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav aria-label="Lists" className="flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={href(t.value)}
          scroll={false}
          aria-current={t.value === active ? "page" : undefined}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ${t.value === active ? "bg-brand-navy text-white ring-brand-navy" : "text-brand-navy/65 ring-brand-navy/15 hover:ring-brand-primary"}`}
        >
          {t.label}
          {t.count !== undefined && <span className={`rounded-full px-1.5 text-[10px] ${t.value === active ? "bg-white/20" : "bg-brand-navy/[0.06]"}`}>{t.count.toLocaleString("en-IN")}</span>}
        </Link>
      ))}
    </nav>
  );
}
