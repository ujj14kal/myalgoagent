import { describe, expect, it } from "vitest";
import { isoDate, maxPain, parseActive, parseBreadth, parseChain, parseMovers, pcr } from "./extras";

describe("parsers", () => {
  it("reads movers (NSE EQ only)", () => {
    const m = parseMovers("symbol,symbolid,timestamp,dopen,dhigh,dlow,dclose,volume,turnover,pclose,change,changeper,series,exchange\nCENTEXT-RE,1,9/29/2026 12:00:00 AM,2,2.8,1.9,2.79,346265,824929.3,2,0.79,39.5,BE,NSE\nDPABHUSHAN,2,9/29/2026 12:00:00 AM,1384,1665.8,1376.4,1665.8,975157,1.541422E+09,1388.2,277.6,20,EQ,NSE");
    expect(m).toEqual([{ symbol: "DPABHUSHAN.NS", close: 1665.8, prevClose: 1388.2, change: 277.6, changePct: 20, volume: 975157, turnover: 1541422000 }]);
  });
  it("reads most-active rows and computes change", () => {
    const a = parseActive("symbol,series,timestamp,ltp,pclose,tickvol,totvol,bid,bidqty,ask,askqty,tto\nIDEA,EQ,29-09-2026 15:15:11,13.5,13.5,,811075929,13.51,1,13.52,1,10900860485.76");
    expect(a[0]).toMatchObject({ symbol: "IDEA.NS", ltp: 13.5, changePct: 0, volume: 811075929 });
  });
  it("reads breadth and dates", () => {
    expect(parseBreadth("adv_dec_tot\n14\n36\n50")).toEqual({ advances: 14, declines: 36, total: 50 });
    expect(parseBreadth("Segment not subscribed")).toBeNull();
    expect(isoDate("29-09-2026 15:15:11")).toBe("2026-09-29");
    expect(isoDate("9/29/2026 12:00:00 AM")).toBe("2026-09-29");
    expect(isoDate("2026-10-06")).toBe("2026-10-06");
  });
});

describe("option chain", () => {
  const csv =
    "symbol,expiry,calltimestamp,callVol,callltp,callPClose,callbid,callbidqty,callask,callaskqty,callOI,callpOI,cdelta,ctheta,cvega,cgamma,crho,civ,strike,pdelta,ptheta,pvega,pgamma,prho,piv,putbid,putbidqty,putask,putaskqty,putOI,putPOI,putLTP,putPClose,putVol,puttimestamp\n" +
    "NIFTY,06-10-2026,,10,120,100,119,1,121,1,1000,900,0.6,-5,10,0.001,1,0.14,22700,-0.4,-4,10,0.001,-1,0.15,80,1,81,1,3000,2500,80.5,90,20,x\n" +
    "NIFTY,06-10-2026,,10,60,50,59,1,61,1,4000,3000,0.4,-5,10,0.001,1,0.13,22800,-0.6,-4,10,0.001,-1,0.16,140,1,141,1,500,400,140.5,150,20,x";
  const rows = parseChain(csv);
  it("parses both sides with Greeks", () => {
    expect(rows.map((r) => r.strike)).toEqual([22700, 22800]);
    expect(rows[0].call).toMatchObject({ ltp: 120, oi: 1000, iv: 0.14, delta: 0.6 });
    expect(rows[0].put).toMatchObject({ ltp: 80.5, oi: 3000, delta: -0.4 });
  });
  it("computes PCR and max pain", () => {
    expect(pcr(rows)).toBeCloseTo(3500 / 5000);
    // At 22700: calls at 22800 lose 0, puts at 22800 lose 100×500 → 50000. At 22800: calls at 22700 lose 100×1000 → 100000.
    expect(maxPain(rows)).toBe(22700);
  });
});
