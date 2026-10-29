import { describe, expect, it } from "vitest";
import { guessEventType, isIcal, matchModule, parseIcal } from "@/lib/ical";

const cal = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
const ev = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

describe("parseIcal", () => {
  it("reads a single event with folded lines and escaped text", () => {
    const [e, ...rest] = parseIcal(
      cal(
        ev(
          "UID:abc-1",
          "SUMMARY:Datenbanken\\, Vorlesung",
          "DESCRIPTION:Zeile 1\\nZeile 2 mit sehr langem",
          "  Text",
          "LOCATION:Raum C-301",
          "DTSTART:20261020T073000Z",
          "DTEND:20261020T090000Z",
          "BEGIN:VALARM",
          "DESCRIPTION:Erinnerung",
          "END:VALARM",
        ),
      ),
    );
    expect(rest).toHaveLength(0);
    expect(e).toMatchObject({ title: "Datenbanken, Vorlesung", description: "Zeile 1\nZeile 2 mit sehr langem Text", location: "Raum C-301", allDay: false });
    expect(e!.start.toISOString()).toBe("2026-10-20T07:30:00.000Z");
    expect(e!.end.toISOString()).toBe("2026-10-20T09:00:00.000Z");
    expect(e!.externalId).toBe("abc-1@2026-10-20T07:30:00.000Z");
  });

  it("converts TZID times across daylight saving time", () => {
    const events = parseIcal(
      cal(
        ev("UID:s", "SUMMARY:Sommer", "DTSTART;TZID=Europe/Berlin:20260715T083000", "DTEND;TZID=Europe/Berlin:20260715T100000"),
        ev("UID:w", "SUMMARY:Winter", "DTSTART;TZID=Europe/Berlin:20261215T083000", "DURATION:PT1H30M"),
      ),
    );
    expect(events.map((e) => e.start.toISOString())).toEqual(["2026-07-15T06:30:00.000Z", "2026-12-15T07:30:00.000Z"]);
    expect(events[1]!.end.toISOString()).toBe("2026-12-15T09:00:00.000Z");
  });

  it("treats DATE values as all-day with an exclusive end", () => {
    const [e] = parseIcal(cal(ev("UID:d", "SUMMARY:Projekttag", "DTSTART;VALUE=DATE:20261102", "DTEND;VALUE=DATE:20261104")));
    expect(e!.allDay).toBe(true);
    expect([e!.start.getDate(), e!.end.getDate(), e!.end.getHours()]).toEqual([2, 3, 23]);
  });

  it("expands weekly rules with COUNT, EXDATE and moved occurrences", () => {
    const events = parseIcal(
      cal(
        ev(
          "UID:lec",
          "SUMMARY:Mathe",
          "DTSTART;TZID=Europe/Berlin:20261005T090000",
          "DTEND;TZID=Europe/Berlin:20261005T103000",
          "RRULE:FREQ=WEEKLY;COUNT=5",
          "EXDATE;TZID=Europe/Berlin:20261012T090000",
        ),
        ev("UID:lec", "RECURRENCE-ID;TZID=Europe/Berlin:20261019T090000", "SUMMARY:Mathe (verlegt)", "DTSTART;TZID=Europe/Berlin:20261020T130000", "DTEND;TZID=Europe/Berlin:20261020T143000"),
      ),
    );
    expect(events.map((e) => [e.title, e.start.toISOString()])).toEqual([
      ["Mathe", "2026-10-05T07:00:00.000Z"],
      ["Mathe (verlegt)", "2026-10-20T11:00:00.000Z"],
      ["Mathe", "2026-10-26T08:00:00.000Z"], // after the switch to winter time: still 09:00 local
      ["Mathe", "2026-11-02T08:00:00.000Z"],
    ]);
    // The moved occurrence keeps the id of its original slot.
    expect(events[1]!.externalId).toBe("lec@2026-10-19T07:00:00.000Z");
  });

  it("supports BYDAY, INTERVAL and UNTIL", () => {
    const events = parseIcal(
      cal(ev("UID:x", "SUMMARY:Labor", "DTSTART:20261006T080000Z", "DTEND:20261006T090000Z", "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261031T235959Z")),
    );
    expect(events.map((e) => e.start.toISOString().slice(0, 10))).toEqual(["2026-10-06", "2026-10-08", "2026-10-20", "2026-10-22"]);
  });

  it("skips cancelled events and events without a start", () => {
    const events = parseIcal(cal(ev("UID:c", "SUMMARY:Fällt aus", "STATUS:CANCELLED", "DTSTART:20261006T080000Z"), ev("UID:n", "SUMMARY:Kaputt")));
    expect(events).toHaveLength(0);
  });

  it("detects iCalendar text", () => {
    expect(isIcal(cal())).toBe(true);
    expect(isIcal("<html>")).toBe(false);
  });
});

describe("matchModule", () => {
  const modules = [
    { id: "db", name: "Datenbanken", code: "T3INF2004" },
    { id: "m1", name: "Mathematik I", code: null },
    { id: "m2", name: "Mathematik II", code: null },
  ];

  it("matches by code or name, preferring the longest match", () => {
    expect(matchModule("T3INF2004 Vorlesung", modules)?.id).toBe("db");
    expect(matchModule("Datenbanken (Übung)", modules)?.id).toBe("db");
    expect(matchModule("Mathematik II - Analysis", modules)?.id).toBe("m2");
    expect(matchModule("Mathematik I", modules)?.id).toBe("m1");
    expect(matchModule("Sport", modules)).toBeNull();
  });

  it("guesses the event type from the title", () => {
    expect(guessEventType("Klausur Mathematik")).toBe("OTHER");
    expect(guessEventType("Abgabe Projektbericht")).toBe("DEADLINE");
    expect(guessEventType("Datenbanken")).toBe("LECTURE");
  });
});
