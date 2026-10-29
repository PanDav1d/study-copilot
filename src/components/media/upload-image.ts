"use client";

import { toast } from "sonner";
import { insertAtCursor } from "@/components/notes/auto-textarea";
import { imageMarkdown } from "@/lib/images";

/** Uploads an image (screenshot, PDF snippet) and returns its URL. */
export async function uploadImage(file: Blob, meta: { documentId?: string; page?: number } = {}) {
  const form = new FormData();
  form.append("file", file, "bild");
  if (meta.documentId) form.append("documentId", meta.documentId);
  if (meta.page) form.append("page", String(meta.page));
  const res = await fetch("/api/attachments", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Bild konnte nicht hochgeladen werden.");
  return data.url;
}

const isImage = (f: File | null): f is File => !!f && f.type.startsWith("image/");

/** Uploads the images and inserts their Markdown where the cursor was. */
async function insertImages(el: HTMLTextAreaElement, files: File[]) {
  const at = { start: el.selectionStart, end: el.selectionEnd };
  const upload = Promise.all(files.map((f) => uploadImage(f)));
  toast.promise(upload, { loading: files.length > 1 ? `${files.length} Bilder werden hochgeladen …` : "Bild wird hochgeladen …", success: "Bild eingefügt", error: (e: Error) => e.message });
  const urls = await upload;
  el.focus();
  el.setSelectionRange(at.start, at.end);
  const before = el.value.slice(0, at.start);
  insertAtCursor(el, `${before && !before.endsWith("\n") ? "\n" : ""}${urls.map((u) => imageMarkdown(u, "Bild")).join("\n")}\n`);
}

/**
 * Paste handler for Markdown textareas: a pasted screenshot (image without text)
 * is uploaded and inserted as an image. Text – including our own copied
 * snippets, which carry Markdown *and* the image – pastes as usual.
 */
export function pasteImages(e: React.ClipboardEvent<HTMLTextAreaElement>) {
  const files = Array.from(e.clipboardData?.items ?? []).map((i) => (i.kind === "file" ? i.getAsFile() : null)).filter(isImage);
  if (!files.length || e.clipboardData.getData("text/plain")) return;
  e.preventDefault();
  void insertImages(e.currentTarget, files).catch(() => {});
}

export function dropImages(e: React.DragEvent<HTMLTextAreaElement>) {
  const files = Array.from(e.dataTransfer?.files ?? []).filter(isImage);
  if (!files.length) return;
  e.preventDefault();
  e.stopPropagation();
  void insertImages(e.currentTarget, files).catch(() => {});
}
