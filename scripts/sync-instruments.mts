// Adds every NSE equity + main index that isn't an instrument yet:
//   npx tsx --env-file=.env.local scripts/sync-instruments.mts
import { prisma } from "../src/lib/prisma";
import { INDEX_INSTRUMENTS, parseUniverseCsv } from "../src/lib/instruments/universe";

const res = await fetch("https://api.dhan.co/v2/instrument/NSE_EQ", { redirect: "follow" });
const rows = [...parseUniverseCsv(await res.text()), ...INDEX_INSTRUMENTS];
if (rows.length < 1000) throw new Error(`Only ${rows.length} rows — not syncing`);
const before = await prisma.instrument.count();
const { count } = await prisma.instrument.createMany({ data: rows, skipDuplicates: true });
console.log(`listed ${rows.length}, had ${before}, added ${count}, now ${await prisma.instrument.count()}`);
await prisma.$disconnect();
