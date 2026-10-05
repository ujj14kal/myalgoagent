import type { Time } from "lightweight-charts";

// lightweight-charts draws every axis label and crosshair time in UTC. Our
// candles are real unix seconds, so an NSE open (9:15 IST) would read 03:45
// and a daily bar stamped at IST midnight would show the previous date.
// These formatters render the same instants in IST, whatever the viewer's
// device clock is set to.

const TZ = "Asia/Kolkata";
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: TZ });
const dateYearFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: TZ });
const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: TZ });
const yearFmt = new Intl.DateTimeFormat("en-IN", { year: "numeric", timeZone: TZ });
const hmFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
const hmsFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: TZ });

const toDate = (t: Time): Date | null => (typeof t === "number" ? new Date(t * 1000) : null);

/** Crosshair label: "12 Sep 25 09:15" for intraday bars, "12 Sep 25" for daily and longer. */
export function istCrosshairTime(t: Time): string {
  const d = toDate(t);
  if (!d) return "";
  const date = dateYearFmt.format(d);
  const time = hmFmt.format(d);
  return time === "00:00" || time === "24:00" ? date : `${date} ${time}`;
}

/** Axis tick: year / month / day / clock time, in IST. tickMarkType: 0 year, 1 month, 2 day, 3 time, 4 time with seconds. */
export function istTickMark(t: Time, tickMarkType: number): string | null {
  const d = toDate(t);
  if (!d) return null;
  switch (tickMarkType) {
    case 0: return yearFmt.format(d);
    case 1: return monthFmt.format(d);
    case 2: return dateFmt.format(d);
    case 3: return hmFmt.format(d);
    default: return hmsFmt.format(d);
  }
}

/** Spread into createChart options so every chart reads in IST. */
export const istChartOptions = {
  localization: { timeFormatter: istCrosshairTime },
  timeScale: { tickMarkFormatter: istTickMark },
} as const;
