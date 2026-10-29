/**
 * MCP server (stdio) bundled into the desktop app as `Resources/server/mcp-server.mjs`
 * and run with the app's own Node runtime. Claude starts it on demand – the app
 * itself does not need to be open. Settings → "Claude verbinden" registers it.
 *
 * The data folder comes from the app's config, so it follows a folder change.
 * stdout belongs to the MCP protocol – all logging goes to stderr.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { ensureDownloaded, foreignLock, readDataDir } from "./desktop";

console.log = console.info = console.debug = console.error;

function fatal(message: string): never {
  console.error(`[mcp] ${message}`);
  process.exit(1);
}

const dataDir = process.env.DATA_DIR || readDataDir();
if (!dataDir) fatal("Kein Datenordner gefunden. Bitte Study Copilot einmal öffnen und einen Ordner wählen.");
const dbFile = path.join(dataDir, "study.db");
ensureDownloaded(dbFile);
if (!existsSync(dbFile)) fatal(`Keine Datenbank in ${dataDir}. Bitte Study Copilot einmal öffnen.`);

process.env.DATA_DIR = dataDir;
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.UPLOAD_DIR = path.join(dataDir, "Unterlagen");
process.env.TZ ||= "Europe/Berlin";
// Required by the shared env schema; the MCP server never signs sessions.
process.env.AUTH_SECRET ||= randomBytes(32).toString("hex");

const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
const { createStudyServer, resolveUser } = await import("./server");

try {
  const user = await resolveUser();
  const server = createStudyServer(user, {
    writeGuard: () => {
      const host = foreignLock(dataDir);
      return host
        ? `Der Datenordner ist gerade auf „${host}“ geöffnet. Damit nichts verloren geht, ändert Claude erst etwas, wenn Study Copilot dort beendet ist. Lesen geht weiterhin.`
        : null;
    },
  });
  await server.connect(new StdioServerTransport());
  console.error(`[mcp] study-copilot bereit (${dataDir})`);
} catch (error) {
  fatal(error instanceof Error ? error.message : String(error));
}
