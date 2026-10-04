import { describe, expect, it } from "vitest";
import { pageLinks, pageWindow, readPageQuery } from "./pagination";

describe("readPageQuery", () => {
  it("uses sensible defaults and ignores nonsense", () => {
    expect(readPageQuery({})).toEqual({ page: 1, size: 25 });
    expect(readPageQuery({ page: "abc", size: "7" })).toEqual({ page: 1, size: 25 });
    expect(readPageQuery({ page: "-3", size: "100" })).toEqual({ page: 1, size: 100 });
    expect(readPageQuery({ page: ["4", "9"], size: "50" })).toEqual({ page: 4, size: 50 });
  });
  it("takes a different default size", () => {
    expect(readPageQuery({}, 10).size).toBe(10);
  });
});

describe("pageWindow", () => {
  it("covers every record exactly once across the pages", () => {
    const total = 63;
    let seen = 0;
    for (let p = 1; p <= pageWindow(total, 1, 25).pages; p++) {
      const w = pageWindow(total, p, 25);
      seen += w.to - w.from + 1;
    }
    expect(seen).toBe(63);
    expect(pageWindow(63, 3, 25)).toMatchObject({ pages: 3, skip: 50, from: 51, to: 63 });
  });
  it("pulls a page past the end back to the last one (empty page after deleting)", () => {
    expect(pageWindow(30, 9, 25)).toMatchObject({ page: 2, from: 26, to: 30 });
  });
  it("handles an empty list", () => {
    expect(pageWindow(0, 5, 25)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0, skip: 0 });
  });
});

describe("pageLinks", () => {
  it("shows all pages when there are few", () => {
    expect(pageLinks(2, 4)).toEqual([1, 2, 3, 4]);
  });
  it("collapses long runs into gaps", () => {
    expect(pageLinks(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
    expect(pageLinks(1, 20)).toEqual([1, 2, null, 20]);
  });
});
