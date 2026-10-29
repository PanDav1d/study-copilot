/**
 * Local MCP server (stdio) for Claude Desktop, Claude Code & Co.
 *
 *   pnpm mcp            – started by the MCP client, not by hand
 *
 * Reads `.env` from the project root (variables already set by the client win),
 * so DATABASE_URL / UPLOAD_DIR resolve exactly like in the web app.
 * stdout belongs to the MCP protocol – all logging goes to stderr.
 */
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // No .env – everything comes from the client's environment.
}
process.env.TZ ??= "Europe/Berlin";
console.log = console.info = console.debug = console.error;

const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
const { createStudyServer, resolveUser } = await import("../src/mcp/server");
const { db } = await import("../src/lib/db");

try {
  const user = await resolveUser();
  const server = createStudyServer(user);
  await server.connect(new StdioServerTransport());
  console.error(`[mcp] study-copilot bereit für ${user.email}`);
} catch (error) {
  console.error("[mcp]", error instanceof Error ? error.message : error);
  await db.$disconnect();
  process.exit(1);
}
