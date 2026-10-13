import Image from "next/image";

// What the app frame looks like while its data loads: the same sidebar, top bar and page area, so nothing moves when the real
// frame arrives. Static (no client code), so it is part of the very first response.
export default function AppShellSkeleton() {
  return (
    <div className="app-canvas flex min-h-screen overflow-x-clip" role="status" aria-label="Loading your workspace">
      <aside className="app-sidebar-bg sticky top-0 hidden h-screen w-64 shrink-0 flex-col text-white md:flex">
        <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
          <Image src="/brand/icon-mark.png" alt="" width={30} height={30} priority className="rounded-lg ring-1 ring-white/20" />
          <span className="text-base font-bold tracking-tight text-white">MyAlgoAgent</span>
        </div>
        <div className="min-h-0 flex-1 space-y-2 px-3 pb-4 pt-3">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2">
              <span className="h-4 w-4 rounded bg-white/15" />
              <span className="h-3 rounded bg-white/10" style={{ width: `${48 + ((i * 17) % 38)}%` }} />
            </div>
          ))}
        </div>
        <div className="shrink-0 border-t border-white/10 p-3">
          <div className="h-20 rounded-2xl bg-white/[0.07]" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-black/[0.06] bg-white/80 px-4 backdrop-blur-xl md:px-6">
          <div className="skeleton h-5 w-40" />
          <div className="ml-auto flex items-center gap-3">
            <div className="skeleton hidden h-8 w-24 rounded-full sm:block" />
            <div className="skeleton h-9 w-9 rounded-xl" />
            <div className="skeleton hidden h-8 w-36 rounded-full sm:block" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-6 lg:p-8">
          <div className="space-y-6">
            <div className="skeleton h-36 w-full rounded-3xl" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-24" />
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="skeleton h-72 lg:col-span-2" />
              <div className="skeleton h-72" />
            </div>
          </div>
        </main>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
