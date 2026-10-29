import { describe, expect, it } from "vitest";
import {
  CSS_UNITS,
  PAGE_GAP,
  PAGE_PAD,
  anchorOf,
  currentPage,
  findInPage,
  firstMatchFrom,
  fitZoom,
  initialPosition,
  itemRanges,
  layout,
  offsetOf,
  pageAt,
  pageText,
  parseViewState,
  rotateSize,
  stepZoom,
  visibleRange,
} from "@/lib/pdf-view";

const A4 = { w: 595, h: 842 };
const SLIDE = { w: 720, h: 405 };

describe("layout", () => {
  it("stacks pages with padding and gaps", () => {
    const l = layout([A4, A4, SLIDE], 1);
    const h = Math.round(842 * CSS_UNITS);
    expect(l.tops).toEqual([PAGE_PAD, PAGE_PAD + h + PAGE_GAP, PAGE_PAD + 2 * (h + PAGE_GAP)]);
    expect(l.width).toBe(Math.round(720 * CSS_UNITS) + 2 * PAGE_PAD);
    expect(l.height).toBe(l.tops[2]! + l.heights[2]! + PAGE_PAD);
  });

  it("rotating swaps the sides", () => {
    expect(rotateSize(A4, 90)).toEqual({ w: 842, h: 595 });
    expect(rotateSize(A4, 180)).toEqual(A4);
  });

  it("finds the page at a position, gaps count to the next page", () => {
    const l = layout([A4, A4, A4], 1);
    expect(pageAt(l, 0)).toBe(0);
    expect(pageAt(l, l.tops[1]! + 5)).toBe(1);
    expect(pageAt(l, l.tops[1]! - 2)).toBe(1); // in the gap above page 2
    expect(pageAt(l, 1e9)).toBe(2);
  });

  it("current page follows the reading line, visible range covers the viewport", () => {
    const l = layout(Array.from({ length: 10 }, () => A4), 1);
    expect(currentPage(l, 0, 800)).toBe(0);
    expect(currentPage(l, l.tops[4]!, 800)).toBe(4);
    const [a, b] = visibleRange(l, l.tops[4]!, 800, 0);
    expect(a).toBe(4);
    expect(b).toBeGreaterThanOrEqual(4);
    expect(visibleRange(layout([], 1), 0, 800)).toEqual([0, -1]);
  });

  it("an anchor survives a zoom change", () => {
    const l1 = layout([A4, A4, A4], 1);
    const y = l1.tops[1]! + l1.heights[1]! * 0.25;
    const a = anchorOf(l1, y);
    expect(a.page).toBe(1);
    expect(a.frac).toBeCloseTo(0.25, 2);
    const l2 = layout([A4, A4, A4], 2);
    expect(offsetOf(l2, a.page, a.frac)).toBeCloseTo(l2.tops[1]! + l2.heights[1]! * 0.25, 0);
  });
});

describe("zoom", () => {
  it("fits width and page", () => {
    const vw = 800 + 2 * PAGE_PAD;
    expect(fitZoom("width", [A4], vw, 600)).toBeCloseTo(800 / (595 * CSS_UNITS), 5);
    const page = fitZoom("page", [A4], vw, 600);
    expect(page).toBeCloseTo((600 - 2 * PAGE_PAD) / (842 * CSS_UNITS), 5);
  });

  it("steps through the zoom levels, also from values in between", () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(1.17, 1)).toBe(1.25);
    expect(stepZoom(1.17, -1)).toBe(1.1);
    expect(stepZoom(5, 1)).toBe(5);
  });
});

describe("search", () => {
  const items = [
    { str: "Die Normal", hasEOL: false },
    { str: "form ist", hasEOL: true },
    { str: "wichtig.  Normalform!", hasEOL: false },
  ];

  it("joins items, line ends become spaces, case-insensitive", () => {
    const pt = pageText(items);
    expect(pt.text).toBe("die normalform ist wichtig.  normalform!");
    expect(pt.starts).toEqual([0, 10, 19]);
  });

  it("finds matches across items and irregular whitespace", () => {
    const pt = pageText(items);
    expect(findInPage(3, pt, "NORMALFORM")).toEqual([
      { page: 3, start: 4, end: 14 },
      { page: 3, start: 29, end: 39 },
    ]);
    expect(findInPage(0, pt, "ist wichtig. normal")).toHaveLength(1);
    expect(findInPage(0, pt, "a.b")).toEqual([]); // regex characters are literal
    expect(findInPage(0, pt, "  ")).toEqual([]);
  });

  it("maps a match to ranges inside the text spans", () => {
    const pt = pageText(items);
    const [m] = findInPage(0, pt, "normalform");
    const ranges = itemRanges(pt, items.map((i) => i.str.length), [{ ...m!, index: 7 }]);
    expect(ranges.get(0)).toEqual([[4, 10, 7]]);
    expect(ranges.get(1)).toEqual([[0, 4, 7]]);
    expect(ranges.has(2)).toBe(false);
  });

  it("starts at the first hit from the current page", () => {
    const ms = [
      { page: 1, start: 0, end: 1 },
      { page: 5, start: 0, end: 1 },
    ];
    expect(firstMatchFrom(ms, 3)).toBe(1);
    expect(firstMatchFrom(ms, 9)).toBe(0); // wraps
    expect(firstMatchFrom([], 0)).toBe(-1);
  });
});

describe("reading position", () => {
  it("parses the stored view defensively", () => {
    expect(parseViewState(null)).toBeNull();
    expect(parseViewState("{bad")).toBeNull();
    expect(parseViewState(JSON.stringify({ page: 0 }))).toBeNull();
    expect(parseViewState(JSON.stringify({ page: 4, frac: 3, zoom: { mode: "x", value: 99 }, rotation: 45 }))).toEqual({
      page: 4,
      frac: 0,
      zoom: { mode: "width", value: 5 },
      rotation: 0,
    });
  });

  it("explicit page wins, then the local position, then the server", () => {
    const local = { page: 7, frac: 0.4, zoom: { mode: "width" as const, value: 1 }, rotation: 0 };
    expect(initialPosition(3, local, 7, 20)).toEqual({ page: 3, frac: 0, restored: false });
    expect(initialPosition(null, local, 7, 20)).toEqual({ page: 7, frac: 0.4, restored: true });
    // Read further on another device: the server position wins.
    expect(initialPosition(null, local, 12, 20)).toEqual({ page: 12, frac: 0, restored: true });
    expect(initialPosition(null, null, 1, 20)).toEqual({ page: 1, frac: 0, restored: false });
    expect(initialPosition(99, null, 1, 20).page).toBe(20);
  });
});
