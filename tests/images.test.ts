import { describe, expect, it } from "vitest";
import { checkImage, imageMarkdown, MAX_IMAGE_BYTES, sniffImage } from "@/lib/images";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const ascii = (s: string, pad = 16) => new Uint8Array([...Buffer.from(s, "latin1"), ...new Array(pad).fill(0)]);

describe("images", () => {
  it("detects the real type from magic bytes", () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(ascii("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(ascii("GIF89a"))).toBe("image/gif");
    expect(sniffImage(ascii("<svg xmlns="))).toBeNull(); // SVG could carry script
    expect(sniffImage(ascii("%PDF-1.4"))).toBeNull();
  });

  it("rejects empty, oversized and unknown files", () => {
    expect(checkImage(new Uint8Array())).toMatchObject({ ok: false });
    expect(checkImage(new Uint8Array(MAX_IMAGE_BYTES + 1))).toMatchObject({ ok: false });
    expect(checkImage(ascii("hello"))).toMatchObject({ ok: false });
    expect(checkImage(bytes(0xff, 0xd8, 0xff))).toEqual({ ok: true, mime: "image/jpeg" });
  });

  it("builds Markdown without breaking the alt text", () => {
    expect(imageMarkdown("/api/attachments/x", "Folie [3]")).toBe("![Folie 3](/api/attachments/x)");
  });
});
