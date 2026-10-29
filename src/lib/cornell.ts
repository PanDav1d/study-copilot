import { z } from "zod";

/**
 * Cornell notes are a two-column table: every row pairs a cue (keyword or
 * question, left) with the notes that explain it (right). This makes the sheet
 * directly usable for recall – cover the right column, answer the left one –
 * and every row with a cue can become a flashcard (front = cue, back = notes).
 */
export interface CornellRow {
  id: string;
  cue: string;
  content: string;
}

export const cornellRowSchema = z.object({
  id: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
  cue: z.string().max(10_000),
  content: z.string().max(100_000),
});

export const cornellRowsSchema = z
  .array(cornellRowSchema)
  .max(500, "Maximal 500 Zeilen pro Sitzung")
  .refine((rows) => JSON.stringify(rows).length <= 400_000, "Sitzung ist zu lang");

export function newRowId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function emptyRow(): CornellRow {
  return { id: newRowId(), cue: "", content: "" };
}

/** Parse the stored JSON defensively – corrupt data must never break the page. */
export function parseRows(json: string | null | undefined): CornellRow[] {
  if (!json) return [];
  try {
    const parsed = cornellRowsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function serializeRows(rows: CornellRow[]) {
  return JSON.stringify(rows.map(({ id, cue, content }) => ({ id, cue, content })));
}

/** Drop rows that are completely empty (e.g. before saving or rendering). */
export function nonEmptyRows(rows: CornellRow[]) {
  return rows.filter((r) => r.cue.trim() || r.content.trim());
}

/** Plain text of a sheet, used for search snippets and previews. */
export function rowsText(rows: CornellRow[]) {
  return rows.map((r) => `${r.cue}\n${r.content}`).join("\n");
}

/**
 * The whole sheet as Markdown – for pasting into Claude, ChatGPT or a document.
 * Every cue becomes a heading, its notes follow; the summary comes first.
 */
export function sheetMarkdown(sheet: { title: string; date: Date; module: string; rows: CornellRow[]; summary: string }) {
  const date = `${String(sheet.date.getDate()).padStart(2, "0")}.${String(sheet.date.getMonth() + 1).padStart(2, "0")}.${sheet.date.getFullYear()}`;
  const parts = [`# ${sheet.title}`, `_${sheet.module} · ${date}_`];
  if (sheet.summary.trim()) parts.push(`## Zusammenfassung\n\n${sheet.summary.trim()}`);
  for (const r of nonEmptyRows(sheet.rows)) {
    const cue = r.cue.trim().replace(/\s*\n\s*/g, " ");
    parts.push(cue ? `## ${cue}\n\n${r.content.trim()}`.trimEnd() : r.content.trim());
  }
  return `${parts.join("\n\n")}\n`;
}

export interface FlashcardDraft {
  front: string;
  back: string;
}

/** Each row with a cue becomes a card: cue → front, notes → back. */
export function rowsToFlashcardDrafts(rows: CornellRow[]): FlashcardDraft[] {
  return rows
    .filter((r) => r.cue.trim())
    .map((r) => ({ front: r.cue.trim(), back: r.content.trim() }));
}

/** Remove drafts whose front already exists (case/whitespace-insensitive). */
export function withoutExisting(drafts: FlashcardDraft[], existingFronts: string[]) {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const existing = new Set(existingFronts.map(norm));
  const seen = new Set<string>();
  return drafts.filter((d) => {
    const key = norm(d.front);
    if (existing.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Internal document links inside markdown: `[Folien S. 5](doc:<id>#page=5)`.
 * Returns the in-app URL, or null for regular links.
 */
export function resolveDocLink(href: string | undefined): string | null {
  if (!href?.startsWith("doc:")) return null;
  const [id, hash] = href.slice(4).split("#", 2);
  if (!id || !/^[a-z0-9]+$/i.test(id)) return null;
  const page = hash?.match(/^page=(\d{1,5})$/)?.[1];
  return `/documents/${id}${page ? `?page=${page}` : ""}`;
}

export function docLinkMarkdown(id: string, title: string, page?: number) {
  const safeTitle = title.replace(/[[\]]/g, "");
  return `[${safeTitle}${page ? ` S. ${page}` : ""}](doc:${id}${page ? `#page=${page}` : ""})`;
}

/**
 * Warm-up before a lecture (forward testing effect): recalling the previous
 * session primes the new one and makes it easier to learn (Pastötter & Bäuml
 * 2014). Picks up to `n` rows with question and answer, spread over the sheet
 * so the whole session is covered, not just its beginning.
 */
export function warmupRows(rows: CornellRow[], n = 5): CornellRow[] {
  const usable = rows.filter((r) => r.cue.trim() && r.content.trim());
  if (usable.length <= n) return usable;
  const step = usable.length / n;
  return Array.from({ length: n }, (_, i) => usable[Math.floor(i * step + step / 2)]!);
}
