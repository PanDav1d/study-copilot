// Entry point of the bundled server in the desktop app (copied next to the
// Next.js standalone `server.js`). Before the server starts it
//   1. backs up the database once a day (DATA_DIR/Backups, last 14 kept),
//   2. applies pending Prisma migrations (compatible with `_prisma_migrations`),
// so the app needs neither the Prisma CLI nor a terminal.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

// Next.js sets process.title ("next-server …"). On macOS libuv implements that via
// LaunchServices, which registers this node binary (it lives in the app bundle) as a
// foreground app that never finishes launching – a "node" icon bouncing in the Dock.
const title = process.title;
Object.defineProperty(process, "title", { configurable: true, enumerable: true, get: () => title, set() {} });

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR;
if (!dataDir) throw new Error("DATA_DIR is not set");
const dbFile = path.join(dataDir, "study.db");
const KEEP_BACKUPS = 14;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function backup(db) {
  const dir = path.join(dataDir, "Backups");
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `study-${today()}.db`);
  if (existsSync(target)) return;
  await db.backup(target);
  const old = readdirSync(dir).filter((f) => /^study-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -KEEP_BACKUPS);
  for (const f of old) rmSync(path.join(dir, f), { force: true });
  console.log(`[desktop] backup written: ${target}`);
}

function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
  )`);
  const applied = new Set(
    db.prepare(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`).all().map((r) => r.migration_name),
  );
  const dir = path.join(here, "migrations");
  const pending = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !applied.has(d.name))
    .map((d) => d.name)
    .sort();
  for (const name of pending) {
    const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const run = () => {
      db.exec(sql);
      db.prepare(
        `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count) VALUES (?, ?, ?, ?, 1)`,
      ).run(randomUUID(), checksum, Date.now(), name);
    };
    // PRAGMA foreign_keys has no effect inside a transaction (table redefinitions).
    if (/PRAGMA\s+foreign_keys/i.test(sql)) run();
    else db.transaction(run)();
    console.log(`[desktop] migration applied: ${name}`);
  }
}

mkdirSync(dataDir, { recursive: true });
const isNew = !existsSync(dbFile);
const db = new Database(dbFile);
// Rollback journal instead of WAL: a single file is safer for iCloud sync.
db.pragma("journal_mode = DELETE");
if (!isNew) await backup(db);
migrate(db);
db.close();

await import("./server.js");
