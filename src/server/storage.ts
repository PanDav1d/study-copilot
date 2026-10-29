import "server-only";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { uploadDir } from "@/lib/env";

/**
 * Files are stored outside of `public/` under a random key; they are only
 * served through an authenticated route handler. Filenames from the client are
 * never used on disk (prevents path traversal).
 */
function filePath(storageKey: string) {
  if (!/^[a-f0-9-]{36}\.(pdf|png|jpg|webp|gif)$/.test(storageKey)) throw new Error("Invalid storage key");
  return path.join(uploadDir(), storageKey);
}

export async function saveFile(data: Buffer, ext: "pdf" | "png" | "jpg" | "webp" | "gif" = "pdf") {
  await mkdir(uploadDir(), { recursive: true });
  const storageKey = `${randomUUID()}.${ext}`;
  const target = filePath(storageKey);
  const tmp = `${target}.part`;
  await writeFile(tmp, data, { mode: 0o600 });
  await rename(tmp, target);
  const sha256 = createHash("sha256").update(data).digest("hex");
  return { storageKey, sha256 };
}

/**
 * iCloud Drive may offload rarely used files ("Optimize Mac Storage"): the PDF
 * is then replaced by a `.name.pdf.icloud` placeholder. Ask iCloud to download
 * it and wait briefly instead of failing.
 */
async function ensureLocal(target: string) {
  try {
    await access(target);
    return;
  } catch {}
  if (process.platform !== "darwin") return;
  const placeholder = path.join(path.dirname(target), `.${path.basename(target)}.icloud`);
  try {
    await access(placeholder);
  } catch {
    return;
  }
  execFile("brctl", ["download", target], () => {});
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      await access(target);
      return;
    } catch {}
  }
}

export async function readStoredFile(storageKey: string) {
  const target = filePath(storageKey);
  await ensureLocal(target);
  return readFile(target);
}

export async function storedFileSize(storageKey: string) {
  const target = filePath(storageKey);
  await ensureLocal(target);
  return (await stat(target)).size;
}

export async function deleteStoredFile(storageKey: string) {
  await rm(filePath(storageKey), { force: true });
}
