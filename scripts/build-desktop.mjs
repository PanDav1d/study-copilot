// Bundles the app for the desktop shell (desktop/):
//   desktop/build/server/            Next.js standalone server + static assets + migrations
//   desktop/binaries/node-<triple>   Node runtime the server runs on
// better-sqlite3 is a native module, so its binary must match the bundled Node
// version – it is fetched/rebuilt for exactly that version.
//
// Node: $DESKTOP_NODE, otherwise the newest Node 22 from nvm (official builds are
// self-contained; Homebrew's node links against Homebrew libraries and is not portable).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "desktop/build/server");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });

function findNode() {
  if (process.env.DESKTOP_NODE) return process.env.DESKTOP_NODE;
  const dir = path.join(homedir(), ".nvm/versions/node");
  const versions = existsSync(dir) ? readdirSync(dir).filter((v) => /^v22\./.test(v)) : [];
  versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!versions.length) throw new Error("Kein Node 22 gefunden. Installiere es (nvm install 22) oder setze DESKTOP_NODE=/pfad/zu/node.");
  return path.join(dir, versions.at(-1), "bin/node");
}

const version = (dir) => JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).version;

/** Package dirs below a node_modules dir: `name` and `@scope/name`. */
function packagesIn(nodeModules) {
  if (!existsSync(nodeModules)) return [];
  return readdirSync(nodeModules)
    .filter((n) => !n.startsWith("."))
    .flatMap((n) => (n.startsWith("@") ? readdirSync(path.join(nodeModules, n)).map((m) => `${n}/${m}`) : [n]));
}

/**
 * pnpm's layout (node_modules/.pnpm/<id>/node_modules/…) relies on symlinks,
 * which the app bundle cannot keep. Flatten it npm-style: every package at the
 * top level, conflicting versions nested below the package that needs them.
 */
function flattenPnpm(nodeModules) {
  const store = path.join(nodeModules, ".pnpm");
  if (!existsSync(store)) return;
  for (const name of packagesIn(path.join(store, "node_modules"))) {
    const target = path.join(nodeModules, name);
    if (!existsSync(target)) cpSync(path.join(store, "node_modules", name), target, { recursive: true });
  }
  for (const id of readdirSync(store).filter((n) => n !== "node_modules" && n !== "lock.yaml")) {
    const deps = path.join(store, id, "node_modules");
    const all = packagesIn(deps);
    // The package itself is the one whose name matches the store id ("@scope+name@1.0.0").
    const self = all.find((n) => id.startsWith(`${n.replace("/", "+")}@`));
    if (!self) continue;
    if (!existsSync(path.join(nodeModules, self))) cpSync(path.join(deps, self), path.join(nodeModules, self), { recursive: true });
    for (const dep of all.filter((n) => n !== self)) {
      const top = path.join(nodeModules, dep);
      if (existsSync(top) && version(top) === version(path.join(deps, dep))) continue;
      if (!existsSync(top)) cpSync(path.join(deps, dep), top, { recursive: true });
      else cpSync(path.join(deps, dep), path.join(nodeModules, self, "node_modules", dep), { recursive: true });
    }
  }
  rmSync(store, { recursive: true, force: true });
}

const node = findNode();
const nodeVersion = execFileSync(node, ["-v"]).toString().trim().slice(1);
const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
console.log(`→ Node ${nodeVersion} (${node})`);

console.log("→ next build (standalone)");
run("pnpm", ["build"], { env: { ...process.env, NEXT_OUTPUT: "standalone" } });

console.log(`→ ${path.relative(root, out)}`);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// -L: pnpm's symlinked node_modules become real files.
run("cp", ["-RL", ".next/standalone/.", out]);
// File tracing pulls in project files the server never reads – among them desktop/
// with the previous build, which made every bundle contain the last one (GBs).
const unneeded = new Set(["data", "desktop", "tests", "scripts", "pnpm-lock.yaml", "tsconfig.tsbuildinfo"]);
for (const f of readdirSync(out)) if (f.startsWith(".env") || unneeded.has(f)) rmSync(path.join(out, f), { recursive: true, force: true });
flattenPnpm(path.join(out, "node_modules"));
cpSync(path.join(root, ".next/static"), path.join(out, ".next/static"), { recursive: true });
if (existsSync(path.join(root, "public"))) cpSync(path.join(root, "public"), path.join(out, "public"), { recursive: true });
cpSync(path.join(root, "prisma/migrations"), path.join(out, "migrations"), { recursive: true });
cpSync(path.join(root, "desktop/server-entry.mjs"), path.join(out, "server-entry.mjs"));

// MCP server for Claude: one file next to the server, sharing its node_modules for
// the native/runtime parts (Prisma, better-sqlite3).
console.log("→ MCP server");
const { build } = await import("esbuild");
await build({
  entryPoints: [path.join(root, "src/mcp/desktop-entry.ts")],
  outfile: path.join(out, "mcp-server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  conditions: ["react-server"],
  external: ["better-sqlite3", "@prisma/*"],
  tsconfig: path.join(root, "tsconfig.json"),
  // Bundled CommonJS dependencies call require() for Node built-ins.
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  logLevel: "warning",
});

console.log("→ better-sqlite3 for Node", nodeVersion);
const prebuild = path.join(root, "node_modules/.pnpm/node_modules/prebuild-install/bin.js");
const sqlite = path.join(out, "node_modules/better-sqlite3");
if (!existsSync(sqlite)) throw new Error("better-sqlite3 fehlt im Standalone-Bundle");
rmSync(path.join(sqlite, "build"), { recursive: true, force: true });
run(node, [prebuild, "--runtime=node", `--target=${nodeVersion}`, `--arch=${process.arch}`, "--platform=darwin"], { cwd: sqlite });
run(node, ["-e", `new (require("better-sqlite3"))(":memory:").prepare("select 1").get()`], { cwd: out });

console.log("→ Node runtime");
mkdirSync(path.join(root, "desktop/binaries"), { recursive: true });
const target = path.join(root, `desktop/binaries/node-${arch}-apple-darwin`);
cpSync(node, target);

const size = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(path.join(dir, e.name)) : statSync(path.join(dir, e.name)).size), 0);
console.log(`✓ Server-Bundle ${(size(out) / 1e6).toFixed(0)} MB, Node ${(statSync(target).size / 1e6).toFixed(0)} MB`);
console.log(`  Version ${JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version}`);
