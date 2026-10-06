import { pageWindow, type PageWindow } from "./pagination";
// Reading a list page's search, filter and sort settings from the URL — anything unexpected becomes
// the default, so a hand-edited or stale link can never reach the database as a raw value.

type Raw = string | string[] | undefined;
const first = (v: Raw) => (Array.isArray(v) ? v[0] : v);

/** A search box's text: trimmed, at most `max` characters, or undefined when empty. */
export function qText(v: Raw, max = 60): string | undefined {
  const s = first(v)?.trim().slice(0, max);
  return s ? s : undefined;
}

/** One of the allowed values, else the fallback. */
export function qEnum<T extends string>(v: Raw, allowed: readonly T[], fallback: T): T {
  const s = first(v);
  return s !== undefined && (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

/** The current settings as plain strings, for links that keep them (pager, tabs, clear buttons). */
export function keepParams(values: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== ""));
}

/** One page of an in-memory list (e.g. what a broker's API returned), with its window for the pager. */
export function pageRows<T>(rows: T[], page: number, size: number): { rows: T[]; win: PageWindow } {
  const win = pageWindow(rows.length, page, size);
  return { rows: rows.slice(win.skip, win.skip + win.take), win };
}
