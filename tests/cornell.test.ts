import { describe, expect, it } from "vitest";
import {
  docLinkMarkdown,
  nonEmptyRows,
  parseRows,
  resolveDocLink,
  rowsText,
  rowsToFlashcardDrafts,
  serializeRows,
  withoutExisting,
  type CornellRow,
} from "@/lib/cornell";
import { sessionLabel, sessionTitle } from "@/lib/labels";

const rows: CornellRow[] = [
  { id: "a1", cue: "Was ist ein Primärschlüssel?", content: "Ein Attribut, das jedes Tupel **eindeutig** identifiziert." },
  { id: "b2", cue: "", content: "Randnotiz ohne Stichwort" },
  { id: "c3", cue: "  Fremdschlüssel  ", content: "Verweis auf den Primärschlüssel einer anderen Relation" },
  { id: "d4", cue: "", content: "   " },
];

describe("Cornell rows", () => {
  it("round-trips through JSON storage", () => {
    expect(parseRows(serializeRows(rows))).toEqual(rows);
  });

  it("returns an empty sheet for corrupt or invalid data instead of throwing", () => {
    expect(parseRows("not json")).toEqual([]);
    expect(parseRows('{"cue":"x"}')).toEqual([]);
    expect(parseRows('[{"id":"../x","cue":"a","content":"b"}]')).toEqual([]);
    expect(parseRows(null)).toEqual([]);
  });

  it("turns every row with a cue into a card (cue → front, notes → back)", () => {
    expect(rowsToFlashcardDrafts(rows)).toEqual([
      { front: "Was ist ein Primärschlüssel?", back: "Ein Attribut, das jedes Tupel **eindeutig** identifiziert." },
      { front: "Fremdschlüssel", back: "Verweis auf den Primärschlüssel einer anderen Relation" },
    ]);
  });

  it("drops completely empty rows", () => {
    expect(nonEmptyRows(rows).map((r) => r.id)).toEqual(["a1", "b2", "c3"]);
  });

  it("exposes plain text for search snippets", () => {
    expect(rowsText(rows)).toContain("Fremdschlüssel");
    expect(rowsText(rows)).toContain("Randnotiz");
  });

  it("removes drafts that already exist or are duplicated", () => {
    const drafts = [
      { front: "Was ist X?", back: "" },
      { front: "was  ist x?", back: "" },
      { front: "Was ist Y?", back: "" },
    ];
    expect(withoutExisting(drafts, ["WAS IST Y?"])).toEqual([{ front: "Was ist X?", back: "" }]);
  });
});

describe("session labels", () => {
  const date = new Date("2026-10-20T09:00:00");
  it("identifies a session by its date when no topic is set", () => {
    expect(sessionTitle({ title: "", date })).toBe("Sitzung vom Di. 20.10.2026");
    expect(sessionLabel({ title: "  ", date })).toBe("Sitzung vom Di. 20.10.2026");
  });
  it("shows the topic together with the date", () => {
    expect(sessionTitle({ title: "Normalisierung", date })).toBe("Normalisierung");
    expect(sessionLabel({ title: "Normalisierung", date })).toBe("Normalisierung (20.10.)");
  });
});

describe("document links", () => {
  it("resolves doc: links with optional page", () => {
    expect(resolveDocLink("doc:abc123")).toBe("/documents/abc123");
    expect(resolveDocLink("doc:abc123#page=12")).toBe("/documents/abc123?page=12");
    expect(resolveDocLink("https://example.com")).toBeNull();
    expect(resolveDocLink("doc:../../etc")).toBeNull();
    expect(resolveDocLink(undefined)).toBeNull();
  });

  it("builds markdown links that round-trip", () => {
    const md = docLinkMarkdown("abc123", "Folien [Kap. 1]", 4);
    expect(md).toBe("[Folien Kap. 1 S. 4](doc:abc123#page=4)");
    expect(resolveDocLink(md.match(/\((.*)\)/)![1])).toBe("/documents/abc123?page=4");
  });
});

describe("sheet as markdown", () => {
  it("puts the summary first and turns cues into headings", async () => {
    const { sheetMarkdown } = await import("@/lib/cornell");
    const md = sheetMarkdown({
      title: "Normalformen",
      date: new Date(2026, 9, 21),
      module: "Datenbanken",
      summary: "Kurz gesagt.",
      rows: [
        { id: "a", cue: "Was ist 1NF?\n(atomar)", content: "Nur atomare Werte." },
        { id: "b", cue: "", content: "Freie Notiz" },
        { id: "c", cue: " ", content: " " },
      ],
    });
    expect(md).toBe("# Normalformen\n\n_Datenbanken · 21.10.2026_\n\n## Zusammenfassung\n\nKurz gesagt.\n\n## Was ist 1NF? (atomar)\n\nNur atomare Werte.\n\nFreie Notiz\n");
  });
});
