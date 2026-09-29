import "server-only";
import { prisma } from "@/lib/prisma";
import { INDEX_INSTRUMENTS, parseUniverseCsv } from "./universe";

const SOURCE = "https://api.dhan.co/v2/instrument/NSE_EQ";

/** Adds any NSE equity or index that isn't an instrument yet. Never renames or removes (strategies point at them). */
export async function syncInstrumentUniverse(): Promise<{ listed: number; added: number }> {
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(60_000), cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`NSE master: HTTP ${res.status}`);
  const rows = [...parseUniverseCsv(await res.text()), ...INDEX_INSTRUMENTS];
  if (rows.length < 1000) throw new Error("NSE master: suspiciously short list");
  const { count } = await prisma.instrument.createMany({ data: rows, skipDuplicates: true });
  return { listed: rows.length, added: count };
}
