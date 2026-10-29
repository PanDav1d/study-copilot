import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Helpers for the MCP server bundled with the desktop app. They mirror what the
 * Tauri shell (desktop/src/main.rs) stores, so the server finds the data folder
 * the app currently uses – also after it was changed in the app.
 */

/** File name of the bundled server next to `server-entry.mjs` (see scripts/build-desktop.mjs). */
export const MCP_ENTRY = "mcp-server.mjs";
export const MCP_SERVER_NAME = "study-copilot";

const APP_ID = "app.studycopilot.desktop";
const LOCK_FILE = "study.lock";
const LOCK_STALE_SECS = 120;

export function desktopConfigFile(home = homedir()) {
  return path.join(home, "Library/Application Support", APP_ID, "config.json");
}

/** The data folder chosen in the app, or null before the first start. */
export function readDataDir(file = desktopConfigFile()): string | null {
  try {
    const config = JSON.parse(readFileSync(file, "utf8")) as { data_dir?: unknown };
    return typeof config.data_dir === "string" && config.data_dir ? config.data_dir : null;
  } catch {
    return null;
  }
}

function computerName() {
  try {
    return execFileSync("scutil", ["--get", "ComputerName"], { encoding: "utf8" }).trim() || "dieser Mac";
  } catch {
    return "dieser Mac";
  }
}

/** Another Mac with a fresh heartbeat has the folder open (same rule as the app). */
export function foreignLock(dir: string, host = computerName(), now = Date.now()): string | null {
  try {
    const [owner, , ts] = readFileSync(path.join(dir, LOCK_FILE), "utf8").split("\n");
    if (!owner || owner === host) return null;
    return now / 1000 - Number(ts) < LOCK_STALE_SECS ? owner : null;
  } catch {
    return null;
  }
}

/** iCloud may have offloaded the database ("Optimize Mac Storage"): request it and wait. */
export function ensureDownloaded(file: string, timeoutMs = 120_000) {
  if (existsSync(file)) return;
  const placeholder = path.join(path.dirname(file), `.${path.basename(file)}.icloud`);
  if (!existsSync(placeholder)) return;
  try {
    execFileSync("brctl", ["download", file]);
  } catch {
    return;
  }
  const until = Date.now() + timeoutMs;
  while (!existsSync(file) && Date.now() < until) execFileSync("sleep", ["0.5"]);
}
