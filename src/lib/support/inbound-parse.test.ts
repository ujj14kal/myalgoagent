import { describe, expect, it } from "vitest";
import { caseNumberIn, cleanSubject, freshText, isAutomated } from "./inbound-parse";

describe("inbound mail", () => {
  it("finds the case in a reply subject", () => {
    expect(caseNumberIn("Re: Broker connection [MAA-100123]")).toBe(123);
    expect(caseNumberIn("Hello")).toBeNull();
  });
  it("drops machine mail and our own addresses", () => {
    expect(isAutomated("person@gmail.com", {})).toBe(false);
    expect(isAutomated("mailer-daemon@googlemail.com", {})).toBe(true);
    expect(isAutomated("support@myalgoagent.com", {})).toBe(true);
    expect(isAutomated("person@gmail.com", { "auto-submitted": "auto-replied" })).toBe(true);
    expect(isAutomated("person@gmail.com", { precedence: "bulk" })).toBe(true);
    expect(isAutomated("person@gmail.com", { "auto-submitted": "no" })).toBe(false);
  });
  it("keeps only the new text of a reply", () => {
    expect(freshText("Thanks, that worked.\n\nOn Mon, 12 Oct 2026 at 10:00, Support <support@myalgoagent.com> wrote:\n> Hi\n> there")).toBe("Thanks, that worked.");
    expect(freshText("Still broken\n> old line\n> older line")).toBe("Still broken");
    expect(freshText("Line one\nLine two")).toBe("Line one\nLine two");
  });
  it("cleans a subject for a new case", () => {
    expect(cleanSubject("Re: RE: Fwd: Login problem [MAA-100001]")).toBe("Login problem");
    expect(cleanSubject("")).toBe("Email to MyAlgoAgent");
  });
});
