"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/** Jump to a user (email, name, username) or a case ("MAA-100012"). */
export default function QuickSearch() {
  const router = useRouter();
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
        if (!q) return;
        router.push(/^(MAA-\d+|FB-[A-Z0-9]{6})$/i.test(q) ? `/admin/inbox?q=${encodeURIComponent(q)}` : `/admin/users?q=${encodeURIComponent(q)}`);
      }}
      className="relative w-full max-w-md"
    >
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-navy/35" />
      <input
        name="q"
        placeholder="Search users or a case ID (MAA-100001)…"
        className="w-full rounded-xl border border-black/[0.08] bg-white py-2 pl-9 pr-3 text-sm text-brand-navy outline-none placeholder:text-brand-navy/35 focus:border-brand-primary/40 focus:ring-2 focus:ring-brand-primary/10"
      />
    </form>
  );
}
