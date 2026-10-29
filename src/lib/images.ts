/** Validation of uploaded images (pure, testable) – screenshots and PDF snippets in notes. */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
export type ImageMime = keyof typeof IMAGE_TYPES;

/** The real type from the first bytes – the client's `type` is never trusted. */
export function sniffImage(buf: Uint8Array): ImageMime | null {
  const b = (i: number) => buf[i] ?? -1;
  const ascii = (from: number, to: number) => String.fromCharCode(...buf.subarray(from, to));
  if (b(0) === 0x89 && ascii(1, 4) === "PNG" && b(4) === 0x0d && b(5) === 0x0a) return "image/png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
  return null;
}

export function checkImage(buf: Uint8Array): { ok: true; mime: ImageMime } | { ok: false; error: string } {
  if (buf.length === 0) return { ok: false, error: "Leere Datei." };
  if (buf.length > MAX_IMAGE_BYTES) return { ok: false, error: `Bild ist größer als ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` };
  const mime = sniffImage(buf);
  return mime ? { ok: true, mime } : { ok: false, error: "Nur PNG, JPEG, WebP oder GIF." };
}

/** Markdown for an attachment, optionally with the PDF page it came from. */
export function imageMarkdown(url: string, alt = "Bild") {
  return `![${alt.replace(/[[\]]/g, "")}](${url})`;
}
