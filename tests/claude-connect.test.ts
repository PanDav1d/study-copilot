import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { foreignLock, readDataDir } from "@/mcp/desktop";
import { connectDesktop, desktopStatus, disconnectDesktop } from "@/server/claude-connect";

const launch = { command: "/Applications/Study Copilot.app/Contents/MacOS/node", args: ["/Applications/Study Copilot.app/Contents/Resources/server/mcp-server.mjs"] };

function claudeDir() {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), "claude-")), "Claude");
  mkdirSync(dir);
  return path.join(dir, "claude_desktop_config.json");
}

describe("Claude Desktop config", () => {
  it("adds the server and keeps everything else", async () => {
    const file = claudeDir();
    const existing = { preferences: { theme: "dark" }, mcpServers: { other: { command: "x" } } };
    writeFileSync(file, JSON.stringify(existing), { mode: 0o600 });

    expect(await desktopStatus(launch, file)).toEqual({ installed: true, connected: false, current: false });
    await connectDesktop(launch, file);
    const written = JSON.parse(readFileSync(file, "utf8"));
    expect(written).toEqual({ ...existing, mcpServers: { other: { command: "x" }, "study-copilot": launch } });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(await desktopStatus(launch, file)).toEqual({ installed: true, connected: true, current: true });

    // The app was moved: the entry is detected as outdated.
    const moved = { ...launch, command: "/Users/x/Study Copilot.app/Contents/MacOS/node" };
    expect(await desktopStatus(moved, file)).toMatchObject({ connected: true, current: false });

    await disconnectDesktop(file);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(existing);
  });

  it("creates the file when Claude has none yet", async () => {
    const file = claudeDir();
    await connectDesktop(launch, file);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ mcpServers: { "study-copilot": launch } });
  });

  it("never overwrites a broken config", async () => {
    const file = claudeDir();
    writeFileSync(file, "{ broken");
    await expect(connectDesktop(launch, file)).rejects.toThrow("kein gültiges JSON");
    expect(readFileSync(file, "utf8")).toBe("{ broken");
  });

  it("refuses when Claude Desktop is not installed", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "claude-")), "Claude", "claude_desktop_config.json");
    expect((await desktopStatus(launch, file)).installed).toBe(false);
    await expect(connectDesktop(launch, file)).rejects.toThrow("nicht installiert");
  });
});

describe("desktop data folder", () => {
  it("reads the folder from the app config", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "app-"));
    const file = path.join(dir, "config.json");
    expect(readDataDir(file)).toBeNull();
    writeFileSync(file, JSON.stringify({ data_dir: "/Users/x/iCloud/Study Copilot", auth_secret: "s" }));
    expect(readDataDir(file)).toBe("/Users/x/iCloud/Study Copilot");
  });

  it("detects a folder that is open on another Mac", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "data-"));
    const now = 1_800_000_000_000;
    const lock = (host: string, secondsAgo: number) => writeFileSync(path.join(dir, "study.lock"), `${host}\n123\n${now / 1000 - secondsAgo}\n`);
    expect(foreignLock(dir, "MacBook", now)).toBeNull();
    lock("iMac", 20);
    expect(foreignLock(dir, "MacBook", now)).toBe("iMac");
    lock("iMac", 600);
    expect(foreignLock(dir, "MacBook", now)).toBeNull();
    lock("MacBook", 5);
    expect(foreignLock(dir, "MacBook", now)).toBeNull();
  });
});
