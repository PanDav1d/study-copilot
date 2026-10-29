/** Validation helpers for uploaded documents (pure, testable). */

export const PDF_MIME = "application/pdf";

/** A PDF must start with "%PDF-" (within the first 1 KB per the spec). */
export function isPdfBuffer(buf: Uint8Array) {
  const head = Buffer.from(buf.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

/** Remove path components and characters that are unsafe in headers/filesystems. */
export function sanitizeFilename(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "dokument.pdf";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  if (!cleaned || cleaned === "." || cleaned === "..") return "dokument.pdf";
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

export function titleFromFilename(name: string) {
  return sanitizeFilename(name)
    .replace(/\.pdf$/i, "")
    .replace(/[_]+/g, " ")
    .trim()
    .slice(0, 160) || "Dokument";
}

/** RFC 6266 / 5987 Content-Disposition value with an ASCII fallback. */
export function contentDisposition(type: "inline" | "attachment", filename: string) {
  const safe = sanitizeFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export type UploadCheck =
  | { ok: true }
  | { ok: false; error: string };

export function checkUpload(
  file: { name: string; size: number; type: string },
  head: Uint8Array,
  maxBytes: number,
): UploadCheck {
  if (file.size === 0) return { ok: false, error: `„${file.name}“ ist leer.` };
  if (file.size > maxBytes) {
    return { ok: false, error: `„${file.name}“ ist größer als ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  }
  const looksLikePdf = file.type === PDF_MIME || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf || !isPdfBuffer(head)) {
    return { ok: false, error: `„${file.name}“ ist keine gültige PDF-Datei.` };
  }
  return { ok: true };
}
