import { describe, expect, it } from "vitest";
import { checkUpload, contentDisposition, isPdfBuffer, sanitizeFilename, titleFromFilename } from "@/lib/pdf";

const pdf = Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n");
const MB = 1024 * 1024;

describe("PDF upload validation", () => {
  it("detects PDFs by magic bytes", () => {
    expect(isPdfBuffer(pdf)).toBe(true);
    expect(isPdfBuffer(Buffer.from("<html><script>alert(1)</script>"))).toBe(false);
  });

  it("rejects files that only pretend to be PDFs", () => {
    const res = checkUpload({ name: "evil.pdf", size: 100, type: "application/pdf" }, Buffer.from("MZ\x90\x00"), 10 * MB);
    expect(res.ok).toBe(false);
  });

  it("rejects empty and oversized files", () => {
    expect(checkUpload({ name: "a.pdf", size: 0, type: "application/pdf" }, pdf, 10 * MB).ok).toBe(false);
    expect(checkUpload({ name: "a.pdf", size: 11 * MB, type: "application/pdf" }, pdf, 10 * MB).ok).toBe(false);
  });

  it("accepts valid PDFs", () => {
    expect(checkUpload({ name: "Skript.pdf", size: pdf.length, type: "application/pdf" }, pdf, 10 * MB)).toEqual({ ok: true });
  });

  it("sanitizes filenames (path traversal, control chars, extension)", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd.pdf");
    expect(sanitizeFilename("C:\\Users\\x\\Folien 1.pdf")).toBe("Folien 1.pdf");
    expect(sanitizeFilename('a"b<c>\u0000.pdf')).toBe("abc.pdf");
    expect(sanitizeFilename("..")).toBe("dokument.pdf");
  });

  it("derives a readable title", () => {
    expect(titleFromFilename("VL_03_Normalisierung.pdf")).toBe("VL 03 Normalisierung");
  });

  it("builds a safe Content-Disposition header with UTF-8 fallback", () => {
    const header = contentDisposition("attachment", 'Übung "1".pdf');
    expect(header).toContain('filename="_bung 1.pdf"');
    expect(header).toContain("filename*=UTF-8''%C3%9Cbung%201.pdf");
    expect(header).not.toMatch(/[\r\n]/);
  });
});
