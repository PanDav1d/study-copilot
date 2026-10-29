/**
 * Pure helpers of the PDF viewer (components/pdf): page layout, zoom, the page
 * under the reading line, text search and the remembered reading position.
 * No DOM, no pdf.js – everything here is unit-tested.
 */

/** PDF points (1/72 in) → CSS pixels (1/96 in): "100 %" is the printed size. */
export const CSS_UNITS = 96 / 72;
/** Padding around the pages and gap between them, in CSS pixels. */
export const PAGE_PAD = 16;
export const PAGE_GAP = 12;

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

export type ZoomMode = "width" | "page" | "custom";
export interface Zoom {
  mode: ZoomMode;
  /** Only used for "custom". */
  value: number;
}

/** Page size in PDF points (page rotation already applied). */
export interface Size {
  w: number;
  h: number;
}

export interface Layout {
  /** Top edge of each page in CSS pixels, relative to the scroll content. */
  tops: number[];
  widths: number[];
  heights: number[];
  /** Full scroll height / width of the content. */
  height: number;
  width: number;
}

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Extra rotation by the user (0/90/180/270) swaps width and height. */
export function rotateSize(s: Size, rotation: number): Size {
  return rotation % 180 === 0 ? s : { w: s.h, h: s.w };
}

export function layout(sizes: Size[], zoom: number): Layout {
  const k = zoom * CSS_UNITS;
  const tops: number[] = [];
  const widths: number[] = [];
  const heights: number[] = [];
  let y = PAGE_PAD;
  let maxW = 0;
  for (const s of sizes) {
    const w = Math.round(s.w * k);
    const h = Math.round(s.h * k);
    tops.push(y);
    widths.push(w);
    heights.push(h);
    y += h + PAGE_GAP;
    maxW = Math.max(maxW, w);
  }
  return { tops, widths, heights, height: sizes.length ? y - PAGE_GAP + PAGE_PAD : 0, width: maxW + 2 * PAGE_PAD };
}

/** Zoom for "fit width" / "fit page" in a viewport of `vw` × `vh` CSS pixels. */
export function fitZoom(mode: Exclude<ZoomMode, "custom">, sizes: Size[], vw: number, vh: number): number {
  if (!sizes.length || vw <= 0) return 1;
  // The widest / tallest page decides, so the zoom does not jump while scrolling mixed formats.
  const w = Math.max(...sizes.map((s) => s.w)) * CSS_UNITS;
  const h = Math.max(...sizes.map((s) => s.h)) * CSS_UNITS;
  const byWidth = (vw - 2 * PAGE_PAD) / w;
  if (mode === "width") return clampZoom(Math.min(byWidth, 4));
  return clampZoom(Math.min(byWidth, (vh - 2 * PAGE_PAD) / h));
}

export function effectiveZoom(zoom: Zoom, sizes: Size[], vw: number, vh: number) {
  return zoom.mode === "custom" ? clampZoom(zoom.value) : fitZoom(zoom.mode, sizes, vw, vh);
}

/** Next zoom step in or out from `z` (also from values between the steps). */
export function stepZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 0.001) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? MIN_ZOOM;
}

/** Index of the page that contains `y` (or the nearest one in a gap). */
export function pageAt(l: Layout, y: number): number {
  const { tops, heights } = l;
  if (!tops.length) return 0;
  let lo = 0;
  let hi = tops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid]! <= y) lo = mid;
    else hi = mid - 1;
  }
  // In the gap below page `lo`: count it to the next page once past its bottom.
  if (y > tops[lo]! + heights[lo]! && lo < tops.length - 1) return lo + 1;
  return lo;
}

/**
 * The current page: the one under a reading line at 30 % of the viewport –
 * so a page counts as "current" as soon as it fills the upper part of the screen.
 */
export function currentPage(l: Layout, scrollTop: number, viewportH: number) {
  return pageAt(l, scrollTop + viewportH * 0.3);
}

/** Pages to render: everything intersecting the viewport plus `overscan` viewports around it. */
export function visibleRange(l: Layout, scrollTop: number, viewportH: number, overscan = 1): [number, number] {
  if (!l.tops.length) return [0, -1];
  const first = pageAt(l, Math.max(0, scrollTop - viewportH * overscan));
  const last = pageAt(l, scrollTop + viewportH * (1 + overscan));
  return [first, last];
}

/** Position inside a page as a fraction of its height (for restoring after zoom/resize). */
export function anchorOf(l: Layout, y: number): { page: number; frac: number } {
  const page = pageAt(l, y);
  const h = l.heights[page] ?? 1;
  return { page, frac: Math.min(1, Math.max(0, (y - (l.tops[page] ?? 0)) / h)) };
}

export function offsetOf(l: Layout, page: number, frac = 0): number {
  const p = Math.min(Math.max(0, page), l.tops.length - 1);
  if (p < 0) return 0;
  return l.tops[p]! + frac * l.heights[p]!;
}

// ---------------------------------------------------------------------------
// Text search
// ---------------------------------------------------------------------------

export interface TextItemLike {
  str: string;
  hasEOL?: boolean;
}

export interface PageText {
  /** Lower-cased page text; items joined, line ends as a space. */
  text: string;
  /** Offset of each item in `text`. */
  starts: number[];
}

export function pageText(items: TextItemLike[]): PageText {
  let text = "";
  const starts: number[] = [];
  for (const it of items) {
    starts.push(text.length);
    text += it.str;
    if (it.hasEOL && !/\s$/.test(it.str)) text += " ";
  }
  return { text: text.toLowerCase(), starts };
}

export interface Match {
  page: number;
  start: number;
  end: number;
}

export function normalizeQuery(q: string) {
  return q.trim().replace(/\s+/g, " ").toLowerCase();
}

/** All (non-overlapping) occurrences of `query` in a page's text. */
export function findInPage(page: number, pt: PageText, query: string): Match[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  // Whitespace in the PDF is irregular (double spaces, line ends): collapse it for matching.
  const parts = q.split(" ").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(parts.join("\\s+"), "g");
  const out: Match[] = [];
  for (const m of pt.text.matchAll(re)) {
    if (!m[0]) break;
    out.push({ page, start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/**
 * Splits page-level matches into per-item ranges, so each text span of the
 * text layer can highlight its part. Returns item index → [start, end, matchIndex][] (item-relative).
 */
export function itemRanges(pt: PageText, itemLengths: number[], matches: { start: number; end: number; index: number }[]) {
  const out = new Map<number, [number, number, number][]>();
  for (const m of matches) {
    for (let i = 0; i < pt.starts.length; i++) {
      const s = pt.starts[i]!;
      const e = s + (itemLengths[i] ?? 0);
      if (e <= m.start) continue;
      if (s >= m.end) break;
      const from = Math.max(m.start, s) - s;
      const to = Math.min(m.end, e) - s;
      if (to > from) {
        const list = out.get(i) ?? [];
        list.push([from, to, m.index]);
        out.set(i, list);
      }
    }
  }
  return out;
}

/** First match at or after `page` (wrapping), for jumping into the results where the reader is. */
export function firstMatchFrom(matches: Match[], page: number) {
  if (!matches.length) return -1;
  const i = matches.findIndex((m) => m.page >= page);
  return i < 0 ? 0 : i;
}

// ---------------------------------------------------------------------------
// Remembered view per document (localStorage) – the page itself is also saved on the server.
// ---------------------------------------------------------------------------

export interface ViewState {
  page: number;
  frac: number;
  zoom: Zoom;
  rotation: number;
}

export function parseViewState(raw: string | null): ViewState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ViewState> | null;
    if (!v || !Number.isInteger(v.page) || v.page! < 1) return null;
    const mode: ZoomMode = v.zoom?.mode === "page" || v.zoom?.mode === "custom" ? v.zoom.mode : "width";
    const value = typeof v.zoom?.value === "number" && Number.isFinite(v.zoom.value) ? clampZoom(v.zoom.value) : 1;
    const frac = typeof v.frac === "number" && v.frac >= 0 && v.frac <= 1 ? v.frac : 0;
    const rotation = [0, 90, 180, 270].includes(v.rotation as number) ? v.rotation! : 0;
    return { page: v.page!, frac, zoom: { mode, value }, rotation };
  } catch {
    return null;
  }
}

/**
 * Where to open a document: an explicit `?page=` (link to a page) wins; otherwise
 * the locally remembered position (exact, incl. the offset in the page), then the
 * page saved on the server (other device).
 */
export function initialPosition(explicit: number | null, local: ViewState | null, serverPage: number, pageCount: number) {
  const clamp = (p: number) => Math.min(Math.max(1, p), Math.max(1, pageCount));
  if (explicit) return { page: clamp(explicit), frac: 0, restored: false };
  if (local && (local.page === serverPage || serverPage <= 1)) return { page: clamp(local.page), frac: local.frac, restored: local.page > 1 };
  return { page: clamp(serverPage), frac: 0, restored: serverPage > 1 };
}
