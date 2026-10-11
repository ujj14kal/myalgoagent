// Adds every NSE equity, the main BSE equities (groups A and B) and the main indices that aren't instruments yet:
//   npx tsx --env-file=.env.local scripts/sync-instruments.mts
import { prisma } from "../src/lib/prisma";
import { INDEX_INSTRUMENTS, parseBseUniverseCsv, parseUniverseCsv } from "../src/lib/instruments/universe";

const res = await fetch("https://api.dhan.co/v2/instrument/NSE_EQ", { redirect: "follow" });
const nse = parseUniverseCsv(await res.text());
if (nse.length < 1000) throw new Error(`Only ${nse.length} NSE rows — not syncing`);
// BSE is additional: if its list can't be read, NSE still syncs.
let bse: ReturnType<typeof parseBseUniverseCsv> = [];
try {
  const r = await fetch("https://api.dhan.co/v2/instrument/BSE_EQ", { redirect: "follow" });
  bse = parseBseUniverseCsv(await r.text());
  if (bse.length < 500) throw new Error(`only ${bse.length} rows`);
} catch (err) {
  console.warn("BSE list skipped:", err instanceof Error ? err.message : err);
  bse = [];
}
const rows = [...nse, ...bse, ...INDEX_INSTRUMENTS];
const before = await prisma.instrument.count();
const { count } = await prisma.instrument.createMany({ data: rows, skipDuplicates: true });
console.log(`listed ${rows.length}, had ${before}, added ${count}, now ${await prisma.instrument.count()}`);
await prisma.$disconnect();
