import { MAX_DATASET_ROWS } from "./index";

// Reading an uploaded table: one row per line, "time, number" (a header line is fine). Pure, so every format is tested.

const IST = 19_800;
/** A row with only a date counts from 18:00 IST that day (after the close), never earlier: end-of-day numbers aren't known at the open. */
const END_OF_DAY = 18 * 3600;

const pad = (n: string) => n.padStart(2, "0");

/** Seconds since 1970 for a date or date-time written in the table, in Indian time; null if it isn't a date. */
export function parseTime(raw: string): number | null {
  const s = raw.trim().replace(/^"|"$/g, "");
  if (!s) return null;
  if (/^\d{9,10}$/.test(s)) return Number(s); // already seconds
  if (/^\d{12,13}$/.test(s)) return Math.floor(Number(s) / 1000); // milliseconds
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  let parts: { y: string; mo: string; d: string; h?: string; mi?: string; sec?: string } | null = m ? { y: m[1], mo: m[2], d: m[3], h: m[4], mi: m[5], sec: m[6] } : null;
  if (!parts) {
    m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
    if (m) parts = { y: m[3], mo: m[2], d: m[1], h: m[4], mi: m[5], sec: m[6] };
  }
  if (!parts) return null;
  const month = Number(parts.mo);
  const day = Number(parts.d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const base = Date.parse(`${parts.y}-${pad(parts.mo)}-${pad(parts.d)}T00:00:00Z`) / 1000;
  if (!Number.isFinite(base)) return null;
  const withTime = parts.h !== undefined;
  const t = base - IST + (withTime ? Number(parts.h) * 3600 + Number(parts.mi) * 60 + Number(parts.sec ?? 0) : END_OF_DAY);
  return Number.isFinite(t) ? t : null;
}

export type ParsedDataset = { times: number[]; values: number[]; skipped: number };

/** Turns pasted or uploaded text into ascending rows. Throws a plain-English error when it can't be used. */
export function parseDataset(text: string): ParsedDataset {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Paste your table: one row per line, a date and a number, like 2026-03-10, 0.42.");
  const delimiter = lines.some((l) => l.includes("\t")) ? "\t" : lines.some((l) => l.includes(";")) ? ";" : ",";
  const rows = new Map<number, number>();
  let skipped = 0;
  lines.forEach((line, i) => {
    const cells = line.split(delimiter).map((c) => c.trim());
    const t = cells.length >= 2 ? parseTime(cells[0]) : null;
    const v = cells.length >= 2 ? Number(cells[1].replace(/^"|"$/g, "")) : NaN;
    if (t === null || !Number.isFinite(v) || cells[1] === "") {
      if (i === 0) return; // a header line
      skipped++;
      return;
    }
    rows.set(t, v); // a repeated time keeps the last value
  });
  if (rows.size === 0) throw new Error("No usable rows. Each line needs a date (2026-03-10, 10/03/2026 or 2026-03-10 15:30) and a number, separated by a comma, tab or semicolon.");
  if (rows.size < 2) throw new Error("A dataset needs at least 2 rows.");
  if (rows.size > MAX_DATASET_ROWS) throw new Error(`That is ${rows.size.toLocaleString("en-IN")} rows; a dataset can hold ${MAX_DATASET_ROWS.toLocaleString("en-IN")}. Keep the most recent ones.`);
  const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0]);
  return { times: sorted.map((r) => r[0]), values: sorted.map((r) => r[1]), skipped };
}
