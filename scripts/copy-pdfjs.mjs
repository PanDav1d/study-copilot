// Copies the pdf.js worker and its runtime assets (CMaps, standard fonts, wasm
// image decoders, ICC profiles) to public/pdfjs, served as static files.
// Runs on install, so the assets always match the installed pdfjs-dist version.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "node_modules/pdfjs-dist");
const out = path.join(root, "public/pdfjs");

if (!existsSync(src)) process.exit(0);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(path.join(src, "build/pdf.worker.min.mjs"), path.join(out, "pdf.worker.min.mjs"));
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  if (existsSync(path.join(src, dir))) cpSync(path.join(src, dir), path.join(out, dir), { recursive: true });
}
