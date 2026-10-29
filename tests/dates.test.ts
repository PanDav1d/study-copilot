import { describe, expect, it } from "vitest";
import { parseGermanDate, parseGermanTime } from "@/lib/dates";

const now = new Date(2026, 9, 19, 12);

describe("parseGermanDate", () => {
  it("reads German formats", () => {
    expect(parseGermanDate("21.10.2026", now)).toBe("2026-10-21");
    expect(parseGermanDate("1.2.27", now)).toBe("2027-02-01");
    expect(parseGermanDate("21.10.", now)).toBe("2026-10-21");
    expect(parseGermanDate("21.10", now)).toBe("2026-10-21");
    expect(parseGermanDate("211026", now)).toBe("2026-10-21");
    expect(parseGermanDate("2026-10-21", now)).toBe("2026-10-21");
    expect(parseGermanDate("morgen", now)).toBe("2026-10-20");
    expect(parseGermanDate("Heute", now)).toBe("2026-10-19");
  });

  it("rejects impossible dates", () => {
    expect(parseGermanDate("31.02.2026", now)).toBeNull();
    expect(parseGermanDate("13/45", now)).toBeNull();
    expect(parseGermanDate("bald", now)).toBeNull();
    expect(parseGermanDate("", now)).toBeNull();
  });
});

describe("parseGermanTime", () => {
  it("reads times", () => {
    expect(parseGermanTime("9")).toBe("09:00");
    expect(parseGermanTime("9:30")).toBe("09:30");
    expect(parseGermanTime("09.30")).toBe("09:30");
    expect(parseGermanTime("1430")).toBe("14:30");
    expect(parseGermanTime("14 Uhr")).toBe("14:00");
    expect(parseGermanTime("25:00")).toBeNull();
  });
});
