/** What changed between an earlier version and now, line by line: lines only in the old one are red, lines only in the new one are green. */
export default function Changes({ before, after }: { before: string; after: string }) {
  const a = before.split("\n");
  const b = after.split("\n");
  const inB = new Set(b);
  const inA = new Set(a);
  const identical = before === after;
  return (
    <div className="grid w-full gap-2 sm:grid-cols-2">
      {identical ? (
        <p className="text-[11px] text-brand-navy/50 sm:col-span-2">The definition is the same; only the name, colour or description changed.</p>
      ) : (
        <>
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-navy/40">Then</p>
            {a.map((l, i) => (
              <p key={i} className={`break-all rounded px-1.5 py-0.5 font-mono ${inB.has(l) ? "" : "bg-brand-sell/10 text-[#9b1111]"}`}>{l}</p>
            ))}
          </div>
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-navy/40">Now</p>
            {b.map((l, i) => (
              <p key={i} className={`break-all rounded px-1.5 py-0.5 font-mono ${inA.has(l) ? "" : "bg-brand-buy/10 text-[#0b6b30]"}`}>{l}</p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
