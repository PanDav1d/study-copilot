import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(__dirname, "../data/test");

/** Creates a fresh SQLite database for integration tests. */
export default function setup() {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  execSync("pnpm prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: `file:${path.join(dir, "test.db")}` },
  });
  return () => rmSync(dir, { recursive: true, force: true });
}
