import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { MCP_ENTRY, MCP_SERVER_NAME } from "@/mcp/desktop";
import { UserError } from "./errors";

/**
 * "Claude verbinden" in the desktop app: registers the bundled MCP server
 * (`Resources/server/mcp-server.mjs`, run with the app's own Node) with
 * Claude Desktop (its JSON config) and Claude Code (via its CLI).
 */

export type ClaudeTarget = "desktop" | "code";

export interface McpLaunch {
  command: string;
  args: string[];
}

export interface TargetStatus {
  /** The Claude app / CLI exists on this Mac. */
  installed: boolean;
  /** An entry for this server exists. */
  connected: boolean;
  /** The entry points to this app (not e.g. an old copy that was moved). */
  current: boolean;
}

/** The desktop server runs with cwd = Resources/server and the bundled Node as execPath. */
export function bundledLaunch(): McpLaunch {
  return { command: process.execPath, args: [path.join(process.cwd(), MCP_ENTRY)] };
}

export function claudeDesktopConfig(home = homedir()) {
  return path.join(home, "Library/Application Support/Claude/claude_desktop_config.json");
}

const sameLaunch = (entry: unknown, launch: McpLaunch) => {
  const e = entry as Partial<McpLaunch> | undefined;
  return e?.command === launch.command && JSON.stringify(e?.args) === JSON.stringify(launch.args);
};

async function readJson(file: string): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return {};
  }
  if (!text.trim()) return {};
  try {
    const data = JSON.parse(text);
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
  } catch {
    // fall through
  }
  throw new UserError(`${path.basename(file)} ist kein gültiges JSON – bitte in Claude prüfen, dann erneut versuchen.`);
}

/** Write via temp file + rename, keeping the file's permissions (Claude uses 0600). */
async function writeJson(file: string, data: Record<string, unknown>) {
  const mode = await stat(file).then((s) => s.mode & 0o777, () => 0o600);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode });
  await rename(tmp, file);
}

// --- Claude Desktop -------------------------------------------------------------

export async function desktopStatus(launch: McpLaunch, file = claudeDesktopConfig()): Promise<TargetStatus> {
  const installed = existsSync(path.dirname(file));
  if (!installed) return { installed, connected: false, current: false };
  const config = await readJson(file).catch(() => ({}) as Record<string, unknown>);
  const entry = (config.mcpServers as Record<string, unknown> | undefined)?.[MCP_SERVER_NAME];
  return { installed, connected: !!entry, current: sameLaunch(entry, launch) };
}

/** Adds or updates our entry; everything else in the file stays untouched. */
export async function connectDesktop(launch: McpLaunch, file = claudeDesktopConfig()) {
  if (!existsSync(path.dirname(file))) throw new UserError("Claude Desktop ist auf diesem Mac nicht installiert.");
  const config = await readJson(file);
  const servers = { ...((config.mcpServers as Record<string, unknown>) ?? {}) };
  servers[MCP_SERVER_NAME] = { command: launch.command, args: launch.args };
  await writeJson(file, { ...config, mcpServers: servers });
}

export async function disconnectDesktop(file = claudeDesktopConfig()) {
  const config = await readJson(file);
  const servers = { ...((config.mcpServers as Record<string, unknown>) ?? {}) };
  if (!(MCP_SERVER_NAME in servers)) return;
  delete servers[MCP_SERVER_NAME];
  await writeJson(file, { ...config, mcpServers: servers });
}

// --- Claude Code ----------------------------------------------------------------

const run = promisify(execFile);

/** Apps started from the Dock have no shell PATH – look in the usual install locations. */
export function findClaudeCli(home = homedir()) {
  const candidates = [
    path.join(home, ".local/bin/claude"),
    path.join(home, ".claude/local/claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

const cliEnv = (cli: string) => ({ ...process.env, PATH: `${path.dirname(cli)}:${path.dirname(process.execPath)}:/usr/bin:/bin` });

export async function codeStatus(launch: McpLaunch, home = homedir()): Promise<TargetStatus> {
  const installed = !!findClaudeCli(home);
  // User-scoped servers live in ~/.claude.json; reading is safe, writing goes through the CLI.
  const config = await readJson(path.join(home, ".claude.json")).catch(() => ({}) as Record<string, unknown>);
  const entry = (config.mcpServers as Record<string, unknown> | undefined)?.[MCP_SERVER_NAME];
  return { installed, connected: !!entry, current: sameLaunch(entry, launch) };
}

export async function connectCode(launch: McpLaunch) {
  const cli = findClaudeCli();
  if (!cli) throw new UserError("Claude Code wurde auf diesem Mac nicht gefunden.");
  await disconnectCode().catch(() => undefined);
  const json = JSON.stringify({ type: "stdio", command: launch.command, args: launch.args });
  try {
    await run(cli, ["mcp", "add-json", "--scope", "user", MCP_SERVER_NAME, json], { env: cliEnv(cli), timeout: 30_000 });
  } catch (error) {
    console.error("[claude-connect] claude mcp add-json failed", error);
    throw new UserError("Claude Code konnte nicht verbunden werden.");
  }
}

export async function disconnectCode() {
  const cli = findClaudeCli();
  if (!cli) return;
  try {
    await run(cli, ["mcp", "remove", "--scope", "user", MCP_SERVER_NAME], { env: cliEnv(cli), timeout: 30_000 });
  } catch {
    // Not registered – nothing to remove.
  }
}
