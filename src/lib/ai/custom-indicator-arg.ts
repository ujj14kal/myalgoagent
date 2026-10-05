import { validateCustomDef, type CustomIndicatorDef } from "@/lib/custom-indicator";

// The agent's draft_custom_indicator arguments → a checked definition, and the
// link that opens it in the builder. Pure, so it's unit-tested.

export const DRAFT_KINDS = ["graph line", "price overlay", "signal markers", "channel", "band", "level", "zone", "rectangle"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);
/** A YYYY-MM-DD date (IST) → seconds; end of day for an "until" date. */
function day(v: unknown, endOfDay = false): number | undefined {
  const d = s(v);
  if (!d) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Dates are YYYY-MM-DD — "${d}" isn't.`);
  return Math.floor(Date.parse(`${d}T${endOfDay ? "23:59:59" : "00:00:00"}+05:30`) / 1000);
}

/** Throws a plain-English error the model can fix. */
export function draftDefFrom(a: Record<string, unknown>): CustomIndicatorDef {
  const kind = (s(a.kind).toLowerCase() || (a.pane === "price" ? "price overlay" : "graph line")) as DraftKind;
  const pane = a.pane === "separate" ? "separate" : a.pane === "price" ? "price" : undefined;
  switch (kind) {
    case "graph line":
    case "price overlay":
      return validateCustomDef({ type: "formula", formula: s(a.formula), pane: kind === "price overlay" ? "price" : "separate" });
    case "signal markers":
      return validateCustomDef({ type: "signal", formula: s(a.formula) });
    case "channel":
      return validateCustomDef({ type: "channel", upper: s(a.upper), lower: s(a.lower), middle: s(a.middle) || undefined, pane });
    case "band":
      return validateCustomDef({ type: "band", middle: s(a.middle), width: s(a.width), pane });
    case "level":
      return validateCustomDef({ type: "level", price: n(a.price), from: day(a.from) });
    case "zone":
      return validateCustomDef({ type: "zone", upper: n(a.upper), lower: n(a.lower), from: day(a.from) });
    case "rectangle":
      if (!s(a.from) || !s(a.to)) throw new Error("A rectangle needs both from and to dates (YYYY-MM-DD).");
      return validateCustomDef({ type: "zone", upper: n(a.upper), lower: n(a.lower), from: day(a.from), to: day(a.to, true) });
  }
  throw new Error(`kind must be one of: ${DRAFT_KINDS.join(", ")}.`);
}

const ymd = (t?: number) => (t ? new Date((t + 19800) * 1000).toISOString().slice(0, 10) : undefined);

/** The same draft as short, readable link parameters — the inverse of draftDefFrom (models keep these intact; long JSON gets cut). */
export function draftParams(def: CustomIndicatorDef): Record<string, string> {
  const out: Record<string, string | undefined> = (() => {
    switch (def.type) {
      case "formula":
        return { formula: def.formula, pane: def.pane };
      case "signal":
        return { kind: "signal markers", formula: def.formula };
      case "channel":
        return { kind: "channel", upper: def.upper, lower: def.lower, middle: def.middle, pane: def.pane };
      case "band":
        return { kind: "band", middle: def.middle, width: def.width, pane: def.pane };
      case "level":
        return { kind: "level", price: String(def.price), from: ymd(def.from) };
      case "zone":
        return { kind: def.to !== undefined ? "rectangle" : "zone", upper: String(def.upper), lower: String(def.lower), from: ymd(def.from), to: ymd(def.to) };
      case "line":
        throw new Error("Trendlines are drawn on a chart, not drafted.");
    }
  })();
  return Object.fromEntries(Object.entries(out).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
}

/** The builder link with the draft filled in (nothing is saved until the user presses Save). */
export function draftLink(def: CustomIndicatorDef, name: string, description: string): string {
  const q = new URLSearchParams({ name: name.slice(0, 60), ...(description ? { description: description.slice(0, 300) } : {}), ...draftParams(def) });
  return `/app/indicators?${q}`;
}
