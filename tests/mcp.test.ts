import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { db } from "@/lib/db";
import { createStudyServer, resolveUser } from "@/mcp/server";

let client: Client;
let moduleId: string;
let foreignModule: string;

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { type: string; text: string }[])[0]!.text;
  return { isError: !!res.isError, text, data: res.isError ? null : JSON.parse(text) };
}

beforeAll(async () => {
  const u = await db.user.create({ data: { email: "mcp@test.de", name: "M", passwordHash: "x" } });
  const s = await db.semester.create({ data: { userId: u.id, name: "S1" } });
  moduleId = (await db.module.create({ data: { userId: u.id, semesterId: s.id, name: "BWL" } })).id;
  const other = await db.user.create({ data: { email: "other@test.de", name: "O", passwordHash: "x" } });
  const os = await db.semester.create({ data: { userId: other.id, name: "S1" } });
  foreignModule = (await db.module.create({ data: { userId: other.id, semesterId: os.id, name: "Fremd" } })).id;

  const server = createStudyServer(await resolveUser("mcp@test.de"));
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
});

describe("MCP server", () => {
  it("needs an explicit account when several exist", async () => {
    await expect(resolveUser(undefined)).rejects.toThrow("MCP_USER_EMAIL");
  });

  it("lists tools without destructive ones", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("create_session");
    expect(names.some((n) => n.startsWith("delete"))).toBe(false);
  });

  it("creates a session, appends rows, summarises and makes cards", async () => {
    const created = await call("create_session", {
      moduleId,
      date: "2026-10-19",
      title: "Kostenrechnung",
      rows: [{ cue: "Was sind Fixkosten?", content: "Kosten unabhängig von der Menge" }],
    });
    expect(created.isError).toBe(false);
    const sessionId = created.data.sessionId;

    const appended = await call("append_cornell_rows", { sessionId, rows: [{ cue: "Variable Kosten", content: "steigen mit der Menge" }] });
    expect(appended.data.rowCount).toBe(2);

    await call("update_session", { sessionId, summary: "Fixe und variable Kosten unterscheiden sich in ihrer Mengenabhängigkeit." });
    const cards = await call("create_flashcards", { moduleId, sessionId, topic: "Kosten", cards: [{ front: "Fixkosten?", back: "mengenunabhängig" }] });
    expect(cards.data.created).toBe(1);

    const session = await call("get_session", { sessionId });
    expect(session.data).toMatchObject({
      title: "Kostenrechnung",
      date: expect.stringMatching(/^2026-10-19T00:00/),
      rows: [{ cue: "Was sind Fixkosten?" }, { cue: "Variable Kosten" }],
      flashcards: ["Fixkosten?"],
    });
    expect(session.data.summary).toContain("Mengenabhängigkeit");

    const found = await call("search", { query: "Fixkosten" });
    expect(found.data.sessions[0].id).toBe(sessionId);
  });

  it("plans a study block", async () => {
    const res = await call("create_study_block", { title: "BWL wiederholen", start: "2026-10-20T10:00", end: "2026-10-20T11:00", moduleId, topic: "Kosten" });
    const event = await db.calendarEvent.findUniqueOrThrow({ where: { id: res.data.eventId } });
    expect(event).toMatchObject({ type: "STUDY", topic: "Kosten", moduleId });
  });

  it("blocks writes while the guard says so, reads still work", async () => {
    const server = createStudyServer(await resolveUser("mcp@test.de"), { writeGuard: () => "Gerade auf „iMac“ geöffnet." });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const guarded = new Client({ name: "guarded", version: "1" });
    await Promise.all([server.connect(a), guarded.connect(b)]);
    const res = await guarded.callTool({ name: "create_session", arguments: { moduleId, date: "2026-10-21" } });
    expect(res).toMatchObject({ isError: true, content: [{ text: "Gerade auf „iMac“ geöffnet." }] });
    expect((await guarded.callTool({ name: "list_modules", arguments: {} })).isError).toBeFalsy();
  });

  it("reports validation and ownership errors as tool errors", async () => {
    expect((await call("create_session", { moduleId, date: "19.10.2026" })).isError).toBe(true);
    const foreign = await call("create_session", { moduleId: foreignModule, date: "2026-10-19" });
    expect(foreign).toMatchObject({ isError: true, text: "Modul wurde nicht gefunden." });
    expect((await call("get_session", { sessionId: "doesnotexist" })).isError).toBe(true);
  });
});
