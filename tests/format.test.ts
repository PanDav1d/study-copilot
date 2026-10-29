import { describe, expect, it } from "vitest";
import { formatEdit } from "@/lib/format";

/** Applies the edit; ‹ › mark the selection before and after. */
function apply(text: string, kind: Parameters<typeof formatEdit>[3]) {
  const start = text.indexOf("‹");
  const end = text.indexOf("›") - 1;
  const value = text.replace("‹", "").replace("›", "");
  const e = formatEdit(value, start, end, kind);
  const out = value.slice(0, e.from) + e.insert + value.slice(e.to);
  return `${out.slice(0, e.selStart)}‹${out.slice(e.selStart, e.selEnd)}›${out.slice(e.selEnd)}`;
}

describe("markdown formatting", () => {
  it("wraps and unwraps, keeping spaces outside", () => {
    expect(apply("ein ‹Wort ›hier", "bold")).toBe("ein **‹Wort›** hier");
    expect(apply("ein **‹Wort›** hier", "bold")).toBe("ein ‹Wort› hier");
    expect(apply("ein ‹**Wort**› hier", "bold")).toBe("ein ‹Wort› hier");
    expect(apply("‹x›", "italic")).toBe("_‹x›_");
    expect(apply("a‹›b", "bold")).toBe("a**‹›**b");
  });

  it("does not take bold for italic", () => {
    expect(apply("**‹fett›**", "italic")).toBe("**_‹fett›_**");
  });

  it("makes multi-line code a code block and back", () => {
    expect(apply("‹a\nb›", "code")).toBe("‹```\na\nb\n```›");
    expect(apply("‹```\na\nb\n```›", "code")).toBe("‹a\nb›");
  });

  it("turns lines into tasks and back", () => {
    expect(apply("‹Normalformen\n- ER-Modell\n  SQL›", "task")).toBe("‹- [ ] Normalformen\n- [ ] ER-Modell\n  - [ ] SQL›");
    expect(apply("‹- [ ] A\n- [x] B›", "task")).toBe("‹A\nB›");
    expect(apply("‹## Analysis\nFourier\n\n## Numerik›", "task")).toBe("‹## Analysis\n- [ ] Fourier\n\n## Numerik›");
    expect(apply("Text\nmi‹›tte\nEnde", "task")).toBe("Text\n- [ ] mitte‹›\nEnde");
  });
});
