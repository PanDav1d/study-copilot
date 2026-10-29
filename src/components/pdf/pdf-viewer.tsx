"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Crop,
  Download,
  Ellipsis,
  ExternalLink,
  FileWarning,
  Info,
  Layers,
  Link2,
  ListTree,
  Loader2,
  Maximize,
  Minimize,
  Moon,
  PanelLeft,
  Quote,
  RotateCw,
  Search,
  Sun,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { Kbd } from "@/components/ui/misc";
import { FlashcardDialog } from "@/components/forms/flashcard-dialog";
import { saveReadingPosition } from "@/server/actions/documents";
import { docLinkMarkdown } from "@/lib/cornell";
import {
  anchorOf,
  clampZoom,
  currentPage,
  effectiveZoom,
  findInPage,
  firstMatchFrom,
  initialPosition,
  layout,
  normalizeQuery,
  offsetOf,
  pageAt,
  pageText,
  parseViewState,
  rotateSize,
  stepZoom,
  visibleRange,
  type Match,
  type Size,
  type ViewState,
  type Zoom,
} from "@/lib/pdf-view";
import { cn } from "@/lib/utils";
import { PdfPage, PdfThumb, type PageHighlight, type PageLink } from "./pdf-page";
import { SnipCard, SnipOverlay, renderRegion } from "./pdf-snip";
import { useNoteTargets } from "@/components/notes/note-channel";
import { useCommand } from "@/components/shell/commands";
import { uploadImage } from "@/components/media/upload-image";
import { imageMarkdown } from "@/lib/images";
import { PDF_ASSETS, loadPdfJs, type PDFDocumentProxy, type PDFPageProxy, type TextContent } from "./pdfjs";

type SidebarTab = "pages" | "outline" | "info";
interface Prefs {
  sidebar: SidebarTab | null;
  invert: boolean;
}
interface OutlineNode {
  title: string;
  dest: unknown;
  url: string | null;
  items: OutlineNode[];
  bold?: boolean;
  italic?: boolean;
}
interface Anchor {
  page: number;
  frac: number;
  /** Distance of the anchor point from the top of the viewport (cursor zoom). */
  offsetY: number;
  left?: number;
}

const PREFS_KEY = "study.pdf.prefs";
const viewKey = (id: string) => `study.pdf.view.${id}`;

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
function readPrefs(): Prefs {
  try {
    const p = JSON.parse(readStorage(PREFS_KEY) ?? "{}") as Partial<Prefs>;
    return { sidebar: p.sidebar === "pages" || p.sidebar === "outline" || p.sidebar === "info" ? p.sidebar : null, invert: p.invert === true };
  } catch {
    return { sidebar: null, invert: false };
  }
}

const isTextItem = <T extends object>(i: T): i is T & { str: string; hasEOL: boolean } => "str" in i;
const NO_MATCHES: Match[] = [];
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface PdfViewerProps {
  id: string;
  title: string;
  src: string;
  downloadHref: string;
  /** `?page=` of the URL when the page was opened (link to a page). */
  explicitPage: number | null;
  /** Reading position saved on the server. */
  lastPage: number;
  pageCount: number;
  moduleId?: string | null;
  /** Left part of the toolbar (title, module). */
  heading?: ReactNode;
  /** Extra actions at the right end of the toolbar (edit/delete menu). */
  actions?: ReactNode;
  /** Content of the "Details" sidebar tab. */
  info?: ReactNode;
}

export default function PdfViewer({ id, title, src, downloadHref, explicitPage, lastPage, pageCount, moduleId, heading, actions, info }: PdfViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [local] = useState<ViewState | null>(() => parseViewState(readStorage(viewKey(id))));
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [load, setLoad] = useState<{ progress: number; error: string | null }>({ progress: 0, error: null });
  const [sizes, setSizes] = useState<Size[]>([]);
  const [zoom, setZoom] = useState<Zoom>(() => local?.zoom ?? { mode: "width", value: 1 });
  const [rotation, setRotation] = useState(() => local?.rotation ?? 0);
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [page, setPage] = useState(0);
  const [ranges, setRanges] = useState<{ mount: [number, number]; render: [number, number] }>({ mount: [0, -1], render: [0, -1] });
  const [moving, setMoving] = useState(false);
  const [restored, setRestored] = useState<number | null>(null);
  const [search, setSearch] = useState({ open: false, query: "" });
  const [rawMatches, setMatches] = useState<Match[]>(NO_MATCHES);
  const [rawSearching, setSearching] = useState(false);
  const [rawSel, setSel] = useState(-1);
  // Results only count while the search bar is open with a real query.
  const searchOn = !!pdf && search.open && normalizeQuery(search.query).length >= 2;
  const matches = searchOn ? rawMatches : NO_MATCHES;
  const sel = searchOn ? rawSel : -1;
  const searching = searchOn && rawSearching;
  const [selection, setSelection] = useState<{ x: number; y: number; text: string; page: number } | null>(null);
  /** Back side of a flashcard being created from the PDF (selected text or snippet). */
  const [cardDraft, setCardDraft] = useState<{ back: string } | null>(null);
  const [snipping, setSnipping] = useState(false);
  const [snip, setSnip] = useState<{ blob: Blob; page: number; x: number; y: number } | null>(null);
  const [snipBusy, setSnipBusy] = useState(false);
  const snipUpload = useRef<Promise<string> | null>(null);
  const notes = useNoteTargets();
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // Narrow (split pane, phone): the sidebar is a drawer over the pages, closed by default.
  const [narrow, setNarrow] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [drawerTab, setDrawerTab] = useState<SidebarTab>("pages");
  const searchInput = useRef<HTMLInputElement>(null);
  const pageInput = useRef<HTMLInputElement>(null);

  const setPrefs = useCallback((fn: (p: Prefs) => Prefs) => {
    setPrefsState((p) => {
      const next = fn(p);
      writeStorage(PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const toggleSidebar = useCallback(() => (narrow ? setDrawer((d) => !d) : setPrefs((p) => ({ ...p, sidebar: p.sidebar ? null : "pages" }))), [narrow, setPrefs]);

  // ---- pdf.js document, pages and text (cached) ----------------------------
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const pageCache = useRef(new Map<number, Promise<PDFPageProxy>>());
  const textCache = useRef(new Map<number, Promise<TextContent>>());
  const getPage = useCallback((i: number) => {
    let p = pageCache.current.get(i);
    if (!p) {
      p = docRef.current!.getPage(i + 1);
      pageCache.current.set(i, p);
    }
    return p;
  }, []);
  const getText = useCallback(
    (i: number) => {
      let t = textCache.current.get(i);
      if (!t) {
        t = getPage(i).then((p) => p.getTextContent());
        textCache.current.set(i, t);
      }
      return t;
    },
    [getPage],
  );

  // ---- layout ----------------------------------------------------------------
  const rotSizes = useMemo(() => sizes.map((s) => rotateSize(s, rotation)), [sizes, rotation]);
  const z = effectiveZoom(zoom, rotSizes, vp.w, vp.h);
  const L = useMemo(() => layout(rotSizes, z), [rotSizes, z]);
  const LRef = useRef(L);
  const zRef = useRef(z);
  const anchor = useRef<Anchor | null>(null);
  const numPages = sizes.length;

  // The canvas follows the zoom once it settles; the page boxes scale at once.
  const [renderZoom, setRenderZoom] = useState(0);
  useEffect(() => {
    if (!numPages) return;
    const t = setTimeout(() => setRenderZoom(z), renderZoom === 0 ? 0 : 160);
    return () => clearTimeout(t);
  }, [z, numPages, renderZoom]);

  const sync = useCallback(() => {
    const el = scrollRef.current;
    const l = LRef.current;
    if (!el || !l.tops.length) return;
    setPage(currentPage(l, el.scrollTop, el.clientHeight));
    const mount = visibleRange(l, el.scrollTop, el.clientHeight, 3);
    const render = visibleRange(l, el.scrollTop, el.clientHeight, 0.75);
    setRanges((r) => (r.mount[0] === mount[0] && r.mount[1] === mount[1] && r.render[0] === render[0] && r.render[1] === render[1] ? r : { mount, render }));
  }, []);

  // Keep the reading position when the layout changes (zoom, resize, rotation, page sizes).
  useLayoutEffect(() => {
    LRef.current = L;
    zRef.current = z;
    const el = scrollRef.current;
    if (!el || !L.tops.length) return;
    const a = anchor.current;
    if (a) {
      el.scrollTop = Math.max(0, offsetOf(L, a.page, a.frac) - a.offsetY);
      if (a.left !== undefined) el.scrollLeft = Math.max(0, a.left);
      anchor.current = { page: a.page, frac: a.frac, offsetY: a.offsetY };
    }
    sync();
  }, [L, z, sync]);

  // Viewport size (split view resizes it all the time).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setVp((v) => (v.w === el.clientWidth && v.h === el.clientHeight ? v : { w: el.clientWidth, h: el.clientHeight }));
      setNarrow((rootRef.current?.clientWidth ?? 1000) < 768);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- load ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      const pdfjs = await loadPdfJs();
      if (cancelled) return;
      const loading = pdfjs.getDocument({ url: src, ...PDF_ASSETS });
      task = loading;
      loading.onProgress = ({ loaded, total }: { loaded: number; total: number }) => total && !cancelled && setLoad((l) => ({ ...l, progress: Math.min(1, loaded / total) }));
      const doc = await loading.promise;
      if (cancelled) return;
      docRef.current = doc;
      pageCache.current = new Map();
      textCache.current = new Map();
      const first = await getPage(0);
      if (cancelled) return;
      const v1 = first.getViewport({ scale: 1 });
      const base: Size[] = Array.from({ length: doc.numPages }, () => ({ w: v1.width, h: v1.height }));
      const init = initialPosition(explicitPage, local, lastPage, doc.numPages);
      anchor.current = { page: init.page - 1, frac: init.frac, offsetY: 0 };
      if (init.restored) setRestored(init.page);
      setSizes(base);
      setPdf(doc);
      doc.getOutline().then((o) => !cancelled && setOutline((o as OutlineNode[] | null) ?? []), () => setOutline([]));
      // Real sizes in the background – mixed formats (A4 + slides) get their own size.
      const next = base.slice();
      let changed = false;
      for (let i = 1; i < doc.numPages; i++) {
        const v = (await getPage(i)).getViewport({ scale: 1 });
        if (cancelled) return;
        if (Math.abs(v.width - next[i]!.w) > 0.5 || Math.abs(v.height - next[i]!.h) > 0.5) {
          next[i] = { w: v.width, h: v.height };
          changed = true;
        }
        if (changed && (i % 25 === 0 || i === doc.numPages - 1)) {
          setSizes(next.slice());
          changed = false;
        }
      }
    })().catch((e: unknown) => {
      if (cancelled) return;
      const name = (e as { name?: string })?.name;
      setLoad({ progress: 0, error: name === "InvalidPDFException" ? "Die Datei ist kein gültiges PDF." : name === "PasswordException" ? "Das PDF ist passwortgeschützt." : "Das PDF konnte nicht geladen werden." });
    });
    return () => {
      cancelled = true;
      task?.destroy().catch(() => {});
      docRef.current = null;
    };
    // Position props are only read when the document loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, getPage]);

  // ---- scrolling ---------------------------------------------------------------
  const zoomRef = useRef(zoom);
  const rotationRef = useRef(rotation);
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  const persistLocal = useCallback(() => {
    const a = anchor.current;
    const p = currentPage(LRef.current, scrollRef.current?.scrollTop ?? 0, scrollRef.current?.clientHeight ?? 0);
    if (!LRef.current.tops.length) return;
    writeStorage(viewKey(id), JSON.stringify({ page: p + 1, frac: a && a.page === p ? Math.round(a.frac * 1000) / 1000 : 0, zoom: zoomRef.current, rotation: rotationRef.current }));
  }, [id]);
  useEffect(() => {
    zoomRef.current = zoom;
    rotationRef.current = rotation;
    if (pdf) persistLocal();
  }, [zoom, rotation, pdf, persistLocal]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const l = LRef.current;
        if (!l.tops.length) return;
        anchor.current = { ...anchorOf(l, el.scrollTop), offsetY: 0 };
        sync();
        setMoving(true);
        setSelection(null);
        clearTimeout(idle);
        idle = setTimeout(() => {
          setMoving(false);
          persistLocal();
        }, 900);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      clearTimeout(idle);
    };
  }, [sync, persistLocal]);

  const goTo = useCallback((p: number, frac = 0) => {
    const el = scrollRef.current;
    const l = LRef.current;
    if (!el || !l.tops.length) return;
    const target = Math.min(Math.max(0, p), l.tops.length - 1);
    const y = Math.max(0, offsetOf(l, target, frac) - (frac ? 24 : 8));
    const near = Math.abs(y - el.scrollTop) < el.clientHeight * 1.5;
    el.scrollTo({ top: y, behavior: near && !reducedMotion() ? "smooth" : "auto" });
  }, []);

  const resolveDest = useCallback(async (dest: unknown) => {
    const doc = docRef.current;
    if (!doc) return null;
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit)) return null;
    const [ref, kind, ...args] = explicit as [unknown, { name?: string } | undefined, ...unknown[]];
    const p = ref && typeof ref === "object" ? await doc.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0]) : Number.isInteger(ref) ? (ref as number) : null;
    if (p === null) return null;
    const top = kind?.name === "XYZ" ? args[1] : kind?.name === "FitH" || kind?.name === "FitBH" ? args[0] : null;
    const h = sizes[p]?.h;
    const frac = typeof top === "number" && h && rotation === 0 ? Math.min(1, Math.max(0, 1 - top / h)) : 0;
    return { page: p, frac };
  }, [sizes, rotation]);

  const followLink = useCallback(
    async (link: Pick<PageLink, "dest">) => {
      const target = await resolveDest(link.dest);
      if (target) goTo(target.page, target.frac);
    },
    [resolveDest, goTo],
  );

  // ---- zoom --------------------------------------------------------------------
  const zoomAt = useCallback((next: number, clientX?: number, clientY?: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const value = clampZoom(next);
    const rect = el.getBoundingClientRect();
    const oy = clientY === undefined ? 0 : clientY - rect.top;
    const ox = clientX === undefined ? el.clientWidth / 2 : clientX - rect.left;
    const k = value / zRef.current;
    anchor.current = { ...anchorOf(LRef.current, el.scrollTop + oy), offsetY: oy, left: (el.scrollLeft + ox) * k - ox };
    setZoom({ mode: "custom", value });
  }, []);
  const zoomStep = useCallback((dir: 1 | -1) => zoomAt(stepZoom(zRef.current, dir)), [zoomAt]);

  // Pinch / ⌘-scroll zoom (Chrome & Firefox send ctrl+wheel, WebKit gesture events).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let base = 1;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAt(zRef.current * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01)), e.clientX, e.clientY);
    };
    type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      base = zRef.current;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as GestureEvent;
      zoomAt(base * g.scale, g.clientX, g.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
    };
  }, [zoomAt]);

  // ---- reading position: URL, server ---------------------------------------
  const searchParams = useSearchParams();
  const urlPage = Number(searchParams.get("page")) || null;
  const writtenPage = useRef<number | null>(explicitPage);
  // A link to another page of this document (while it is open) jumps there.
  useEffect(() => {
    if (!pdf || !urlPage || urlPage === writtenPage.current) return;
    writtenPage.current = urlPage;
    goTo(urlPage - 1);
  }, [urlPage, pdf, goTo]);

  useEffect(() => {
    if (!pdf) return;
    const t = setTimeout(() => {
      const p = page + 1;
      if (writtenPage.current === p) return;
      writtenPage.current = p;
      const url = new URL(window.location.href);
      url.searchParams.set("page", String(p));
      // Integrates with the Next router: the tab remembers the page, nothing re-renders.
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }, 500);
    return () => clearTimeout(t);
  }, [page, pdf]);

  const saved = useRef(pageCount > 0 ? lastPage : -1);
  useEffect(() => {
    if (!pdf) return;
    const p = page + 1;
    if (saved.current === p) return;
    const t = setTimeout(() => {
      saved.current = p;
      void saveReadingPosition({ id, page: p, pageCount: pdf.numPages });
    }, 1200);
    return () => clearTimeout(t);
  }, [page, pdf, id]);

  // ---- search ------------------------------------------------------------------
  useEffect(() => {
    const q = normalizeQuery(search.query);
    if (!pdf || !search.open || q.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      setMatches(NO_MATCHES);
      setSel(-1);
      const all: Match[] = [];
      let picked = false;
      const from = page;
      for (let i = 0; i < pdf.numPages; i++) {
        const tc = await getText(i);
        if (cancelled) return;
        all.push(...findInPage(i, pageText(tc.items.filter(isTextItem)), q));
        if (i % 15 === 14 || i === pdf.numPages - 1) {
          setMatches(all.slice());
          // Select the first hit from where the reader is, as soon as it is known.
          if (!picked && all.some((m) => m.page >= from)) {
            picked = true;
            setSel(firstMatchFrom(all, from));
          }
        }
      }
      if (!picked) setSel(all.length ? 0 : -1);
      setSearching(false);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // The start page is read when the query changes, not on every scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, search.open, search.query, getText]);

  // Bring the selected hit's page into view (the page then centres the hit itself).
  useEffect(() => {
    const m = matches[sel];
    if (!m) return;
    const el = scrollRef.current;
    const l = LRef.current;
    if (!el || !l.tops.length) return;
    const top = l.tops[m.page]!;
    const bottom = top + l.heights[m.page]!;
    if (bottom < el.scrollTop || top > el.scrollTop + el.clientHeight) goTo(m.page, 0.3);
    // Only when the selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const highlights = useMemo(() => {
    const map = new Map<number, PageHighlight[]>();
    matches.forEach((m, index) => {
      const list = map.get(m.page) ?? [];
      list.push({ start: m.start, end: m.end, index });
      map.set(m.page, list);
    });
    return map;
  }, [matches]);

  const openSearch = useCallback(() => {
    setSearch((s) => ({ ...s, open: true }));
    requestAnimationFrame(() => {
      searchInput.current?.focus();
      searchInput.current?.select();
    });
  }, []);
  const stepMatch = useCallback((dir: 1 | -1) => setSel((s) => (matches.length ? (s + dir + matches.length) % matches.length : -1)), [matches.length]);
  // "Bearbeiten → Suchen" in the menu bar searches the PDF.
  useCommand("edit.find", openSearch);

  // ---- text selection → quote / flashcard -------------------------------------
  const quote = (text: string, p: number) => `> ${text}\n>\n> — ${docLinkMarkdown(id, title, p)}`;
  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("Kopieren nicht möglich");
    }
  };
  const readSelection = () => {
    const s = window.getSelection();
    const text = s?.toString().replace(/\s+/g, " ").trim();
    const root = rootRef.current;
    if (!s || !text || !s.rangeCount || !root) return setSelection(null);
    const range = s.getRangeAt(0);
    const pageEl = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest<HTMLElement>("[data-page]");
    if (!pageEl || !root.contains(pageEl)) return setSelection(null);
    const r = range.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    setSelection({ x: Math.min(Math.max(r.left + r.width / 2 - box.left, 140), box.width - 140), y: Math.max(r.top - box.top, 56), text, page: Number(pageEl.dataset.page) });
  };
  useEffect(() => {
    const onChange = () => {
      if (window.getSelection()?.isCollapsed) setSelection(null);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  // ---- snippet: cut a region out of a page ------------------------------------------
  const finishSnip = useCallback(
    async (rect: DOMRect) => {
      setSnipping(false);
      const el = scrollRef.current;
      const root = rootRef.current;
      const l = LRef.current;
      if (!el || !root || !l.tops.length) return;
      const box = el.getBoundingClientRect();
      const contentW = Math.max(l.width, el.clientWidth);
      const ax = rect.left - box.left + el.scrollLeft;
      const ay = rect.top - box.top + el.scrollTop;
      const p = pageAt(l, ay + rect.height / 2);
      const w = l.widths[p]!;
      const h = l.heights[p]!;
      const left = (contentW - w) / 2;
      const clamp = (v: number) => Math.min(1, Math.max(0, v));
      const region = { x0: clamp((ax - left) / w), y0: clamp((ay - l.tops[p]!) / h), x1: clamp((ax + rect.width - left) / w), y1: clamp((ay + rect.height - l.tops[p]!) / h) };
      if ((region.x1 - region.x0) * w < 6 || (region.y1 - region.y0) * h < 6) return;
      try {
        const blob = await renderRegion(await getPage(p), rotation, region);
        const rb = root.getBoundingClientRect();
        snipUpload.current = null;
        setSnip({
          blob,
          page: p + 1,
          x: Math.min(Math.max(rect.left + rect.width / 2 - rb.left, 152), rb.width - 152),
          y: Math.max(52, Math.min(rect.bottom - rb.top + 8, rb.height - 330)),
        });
      } catch {
        toast.error("Ausschnitt konnte nicht erzeugt werden");
      }
    },
    [getPage, rotation],
  );
  const cancelSnip = useCallback(() => setSnipping(false), []);
  const snipMarkdown = (url: string, p: number) => `${imageMarkdown(url, `${title} S. ${p}`)}\n${docLinkMarkdown(id, title, p)}`;
  /** Uploaded once, however many actions use it. */
  const snipUrl = () => (snipUpload.current ??= uploadImage(snip!.blob, { documentId: id, page: snip!.page }));
  const withSnip = async (fn: (markdown: string) => void | Promise<void>) => {
    if (!snip) return;
    setSnipBusy(true);
    try {
      await fn(snipMarkdown(await snipUrl(), snip.page));
      setSnip(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Hochladen");
    } finally {
      setSnipBusy(false);
    }
  };
  const copySnip = async () => {
    if (!snip) return;
    const page = snip.page;
    // The clipboard is written right away (user gesture); the Markdown follows once uploaded.
    const text = snipUrl().then((url) => new Blob([snipMarkdown(url, page)], { type: "text/plain" }));
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": text, "image/png": snip.blob })]);
      toast.success("Ausschnitt kopiert", { description: "⌘V in der Mitschrift fügt Bild + Seitenlink ein." });
      setSnip(null);
    } catch {
      await withSnip(async (md) => {
        await navigator.clipboard.writeText(md);
        toast.success("Markdown kopiert");
      });
    }
  };

  // ---- fullscreen ---------------------------------------------------------------
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.().catch(() => toast.error("Vollbild wird hier nicht unterstützt"));
  }, []);

  // ---- keyboard -------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      const t = e.target as HTMLElement;
      if (!root || !(root.contains(t) || t === document.body)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && !e.shiftKey && !e.altKey) {
        if (key === "f") {
          e.preventDefault();
          openSearch();
        } else if (key === "=" || key === "+") {
          e.preventDefault();
          zoomStep(1);
        } else if (key === "-") {
          e.preventDefault();
          zoomStep(-1);
        } else if (key === "0") {
          e.preventDefault();
          setZoom((zm) => ({ ...zm, mode: "width" }));
        } else if (key === "g" && matches.length) {
          e.preventDefault();
          stepMatch(1);
        }
        return;
      }
      if (mod && e.shiftKey && key === "g" && matches.length) {
        e.preventDefault();
        stepMatch(-1);
        return;
      }
      if (mod || e.altKey || t.closest("input, textarea, select, [contenteditable='true']")) {
        if (e.key === "Escape" && t === searchInput.current) setSearch((s) => ({ ...s, open: false }));
        return;
      }
      const n = LRef.current.tops.length;
      const handled = (() => {
        switch (e.key) {
          case "ArrowRight":
          case "j":
          case "n":
            goTo(Math.min(n - 1, pageRef.current + 1));
            return true;
          case "ArrowLeft":
          case "k":
          case "p":
            goTo(Math.max(0, pageRef.current - 1));
            return true;
          case "Home":
            goTo(0);
            return true;
          case "End":
            goTo(n - 1);
            return true;
          case "g":
            pageInput.current?.focus();
            pageInput.current?.select();
            return true;
          case "r":
            setRotation((r) => (r + 90) % 360);
            return true;
          case "i":
            setPrefs((p) => ({ ...p, invert: !p.invert }));
            return true;
          case "s":
            toggleSidebar();
            return true;
          case "a":
            setSnip(null);
            setSnipping((v) => !v);
            return true;
          case "Escape":
            if (search.open) setSearch((s) => ({ ...s, open: false }));
            else if (selection) setSelection(null);
            else return false;
            return true;
        }
        return false;
      })();
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, openSearch, zoomStep, stepMatch, matches.length, search.open, selection, setPrefs, toggleSidebar]);
  // Keyboard scrolling right away when the viewer is the page's main content.
  useEffect(() => {
    if (pdf && document.activeElement === document.body) scrollRef.current?.focus({ preventScroll: true });
  }, [pdf]);

  useEffect(() => {
    if (restored === null) return;
    const t = setTimeout(() => setRestored(null), 6000);
    return () => clearTimeout(t);
  }, [restored]);

  // ---- render ------------------------------------------------------------------------
  const sidebarOpen = !!pdf && (narrow ? drawer : prefs.sidebar !== null);
  const hasOutline = !!outline?.length;
  // A remembered "Inhalt" tab falls back to the pages when this PDF has no outline.
  const wanted = narrow ? drawerTab : (prefs.sidebar ?? "pages");
  const sidebarTab: SidebarTab = wanted === "outline" && !hasOutline ? "pages" : wanted;
  const showSidebar = (tab: SidebarTab) => (narrow ? setDrawerTab(tab) : setPrefs((p) => ({ ...p, sidebar: tab })));
  const pct = Math.round(z * 100);

  const pages: ReactNode[] = [];
  if (renderZoom > 0) {
    for (let i = Math.max(0, ranges.mount[0]); i <= Math.min(numPages - 1, ranges.mount[1]); i++) {
      const hl = highlights.get(i);
      pages.push(
        <PdfPage
          key={i}
          index={i}
          top={L.tops[i]!}
          width={L.widths[i]!}
          height={L.heights[i]!}
          zoom={z}
          renderZoom={renderZoom}
          rotation={rotation}
          active={i >= ranges.render[0] && i <= ranges.render[1]}
          getPage={getPage}
          getText={getText}
          highlights={hl}
          selected={hl ? sel : -1}
          onLink={followLink}
        />,
      );
    }
  }

  return (
    <div ref={rootRef} className={cn("pdf-viewer @container relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background", prefs.invert && "pdf-invert")}>
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b bg-background px-1.5 @lg:px-2">
        <ToolButton label={sidebarOpen ? "Seitenleiste schließen (S)" : "Seitenleiste (S)"} active={sidebarOpen} onClick={toggleSidebar} disabled={!pdf}>
          <PanelLeft />
        </ToolButton>
        <div className="hidden min-w-0 flex-1 items-center gap-2 pl-1 @3xl:flex">{heading}</div>
        <div className="flex flex-1 items-center justify-center gap-0.5 @3xl:flex-none">
          <ToolButton label="Vorherige Seite (←)" onClick={() => goTo(page - 1)} disabled={!pdf || page === 0}>
            <ChevronUp />
          </ToolButton>
          <PageInput inputRef={pageInput} page={page + 1} total={numPages} onGo={(p) => goTo(p - 1)} disabled={!pdf} />
          <ToolButton label="Nächste Seite (→)" onClick={() => goTo(page + 1)} disabled={!pdf || page >= numPages - 1}>
            <ChevronDown />
          </ToolButton>
        </div>
        <div className="flex items-center gap-0.5 @3xl:ml-auto">
          <span className="hidden items-center gap-0.5 @md:flex">
            <ToolButton label="Verkleinern (⌘−)" onClick={() => zoomStep(-1)} disabled={!pdf}>
              <ZoomOut />
            </ToolButton>
            <Dropdown
              trigger={
                <button type="button" disabled={!pdf} className="h-8 min-w-14 rounded-md px-1.5 text-[13px] font-medium tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40" title="Zoom" aria-label={`Zoom ${pct} %`}>
                  {zoom.mode === "width" ? "Breite" : zoom.mode === "page" ? "Seite" : `${pct} %`}
                </button>
              }
            >
              <DropdownItem onSelect={() => setZoom((zm) => ({ ...zm, mode: "width" }))}>Seitenbreite {zoom.mode === "width" && "✓"}</DropdownItem>
              <DropdownItem onSelect={() => setZoom((zm) => ({ ...zm, mode: "page" }))}>Ganze Seite {zoom.mode === "page" && "✓"}</DropdownItem>
              <DropdownSeparator />
              {[0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((v) => (
                <DropdownItem key={v} onSelect={() => zoomAt(v)}>
                  {Math.round(v * 100)} % {zoom.mode === "custom" && Math.abs(zoom.value - v) < 0.005 && "✓"}
                </DropdownItem>
              ))}
            </Dropdown>
            <ToolButton label="Vergrößern (⌘+)" onClick={() => zoomStep(1)} disabled={!pdf}>
              <ZoomIn />
            </ToolButton>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          </span>
          <ToolButton
            label="Ausschnitt als Bild (A)"
            active={snipping}
            onClick={() => {
              setSnip(null);
              setSnipping((v) => !v);
            }}
            disabled={!pdf}
          >
            <Crop />
          </ToolButton>
          <ToolButton label="Suchen (⌘F)" active={search.open} onClick={() => (search.open ? setSearch((s) => ({ ...s, open: false })) : openSearch())} disabled={!pdf}>
            <Search />
          </ToolButton>
          <ToolButton label={prefs.invert ? "Helle Seiten (I)" : "Dunkle Seiten (I)"} active={prefs.invert} onClick={() => setPrefs((p) => ({ ...p, invert: !p.invert }))} className="hidden @sm:inline-flex">
            {prefs.invert ? <Sun /> : <Moon />}
          </ToolButton>
          <Dropdown
            trigger={
              <button type="button" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4" title="Mehr" aria-label="Mehr Aktionen">
                <Ellipsis />
              </button>
            }
          >
            <DropdownItem icon={<Link2 className="size-4" />} onSelect={() => copy(docLinkMarkdown(id, title, page + 1), `Link zu S. ${page + 1} kopiert – in die Mitschrift einfügen`)}>
              Link zu Seite {page + 1} kopieren
            </DropdownItem>
            <DropdownItem icon={<RotateCw className="size-4" />} onSelect={() => setRotation((r) => (r + 90) % 360)}>
              Drehen
            </DropdownItem>
            <DropdownItem icon={fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />} onSelect={toggleFullscreen}>
              {fullscreen ? "Vollbild beenden" : "Vollbild"}
            </DropdownItem>
            <DropdownItem icon={prefs.invert ? <Sun className="size-4" /> : <Moon className="size-4" />} onSelect={() => setPrefs((p) => ({ ...p, invert: !p.invert }))}>
              {prefs.invert ? "Helle Seiten" : "Dunkle Seiten"}
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={<ExternalLink className="size-4" />} onSelect={() => window.open(src, "_blank", "noopener")}>
              Im Browser öffnen
            </DropdownItem>
            <DropdownItem icon={<Download className="size-4" />} onSelect={() => window.location.assign(downloadHref)}>
              Herunterladen
            </DropdownItem>
          </Dropdown>
          {actions}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className={cn("flex w-52 flex-col border-r bg-sidebar", narrow && "absolute inset-y-0 left-0 z-20 shadow-xl")} aria-label="Seitenleiste">
            <div className="flex shrink-0 gap-0.5 border-b p-1" role="tablist">
              {(
                [
                  ["pages", "Seiten", Layers],
                  ["outline", "Inhalt", ListTree],
                  ["info", "Details", Info],
                ] as const
              )
                .filter(([t]) => t !== "outline" || hasOutline)
                .map(([t, label, Icon]) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={sidebarTab === t}
                    onClick={() => showSidebar(t)}
                    className={cn("flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium", sidebarTab === t ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {sidebarTab === "pages" && (
                <Thumbnails
                  sizes={rotSizes}
                  page={page}
                  getPage={getPage}
                  rotation={rotation}
                  onGo={(p) => {
                    goTo(p);
                    setDrawer(false);
                  }}
                />
              )}
              {sidebarTab === "outline" && outline && (
                <Outline
                  items={outline}
                  onGo={(dest) => {
                    void followLink({ dest });
                    setDrawer(false);
                  }}
                />
              )}
              {sidebarTab === "info" && (
                <div className="space-y-4 p-3 text-sm">
                  {info}
                  <PdfKeyboardHelp />
                </div>
              )}
            </div>
          </aside>
        )}

        {sidebarOpen && narrow && <div className="absolute inset-0 z-10 bg-black/20" onClick={() => setDrawer(false)} aria-hidden />}

        {/* Pages */}
        <div className="relative min-w-0 flex-1">
          {numPages > 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 bg-transparent" aria-hidden>
              <div className="h-full bg-link/70 transition-[width] duration-300" style={{ width: `${((page + 1) / numPages) * 100}%` }} />
            </div>
          )}
          <div
            ref={scrollRef}
            tabIndex={0}
            className="pdf-scroll absolute inset-0 overflow-auto bg-muted/60 outline-none dark:bg-black/30"
            onPointerUp={() => setTimeout(readSelection, 0)}
            onKeyUp={(e) => e.shiftKey && readSelection()}
            aria-label={`${title}, Seite ${page + 1} von ${numPages || "…"}`}
          >
            <div className="relative" style={{ height: L.height, width: L.width, minWidth: "100%" }}>
              {pages}
            </div>
          </div>

          {snipping && <SnipOverlay onDone={finishSnip} onCancel={cancelSnip} onWheel={(e) => scrollRef.current?.scrollBy(e.deltaX, e.deltaY)} />}

          {!pdf && !load.error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="tabular-nums">{load.progress > 0 && load.progress < 1 ? `Lädt … ${Math.round(load.progress * 100)} %` : "Lädt …"}</span>
            </div>
          )}
          {load.error && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-sm rounded-xl border bg-card p-6 text-center shadow-xs">
                <FileWarning className="mx-auto mb-3 size-6 text-danger" />
                <p className="text-sm font-medium">{load.error}</p>
                <a href={downloadHref} className="mt-3 inline-flex items-center gap-1.5 text-sm text-link hover:underline">
                  <Download className="size-4" /> Datei herunterladen
                </a>
              </div>
            </div>
          )}

          {search.open && (
            <SearchBar
              inputRef={searchInput}
              query={search.query}
              onQuery={(query) => setSearch((s) => ({ ...s, query }))}
              count={matches.length}
              index={sel}
              searching={searching}
              onStep={stepMatch}
              onClose={() => {
                setSearch((s) => ({ ...s, open: false }));
                scrollRef.current?.focus({ preventScroll: true });
              }}
            />
          )}

          {/* Page indicator while scrolling */}
          {numPages > 0 && (
            <div
              className={cn(
                "pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-foreground/85 px-3 py-1 text-xs font-medium text-background tabular-nums shadow-lg transition-opacity duration-300",
                moving && restored === null ? "opacity-100" : "opacity-0",
              )}
              aria-hidden
            >
              {page + 1} / {numPages}
            </div>
          )}
          {restored !== null && (
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background py-1 pr-1 pl-3 text-xs shadow-lg">
              <span className="whitespace-nowrap">
                Weiter bei <span className="font-semibold tabular-nums">Seite {restored}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  goTo(0);
                  setRestored(null);
                }}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ArrowUpToLine className="size-3.5" /> Zum Anfang
              </button>
              <button type="button" onClick={() => setRestored(null)} className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Hinweis schließen">
                <X className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Actions for selected text */}
      {selection && (
        <div
          className="absolute z-30 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border bg-background p-0.5 text-xs shadow-lg"
          style={{ left: selection.x, top: selection.y - 6 }}
          onPointerDown={(e) => e.preventDefault()}
        >
          <SelButton onClick={() => copy(quote(selection.text, selection.page), "Zitat mit Seitenlink kopiert")} title="Als Markdown-Zitat mit Link zur Seite kopieren">
            <Quote /> Zitieren
          </SelButton>
          <SelButton onClick={() => setCardDraft({ back: `${selection.text}\n\n${docLinkMarkdown(id, title, selection.page)}` })} title="Karteikarte mit dieser Stelle als Antwort">
            <Layers /> Karteikarte
          </SelButton>
          <SelButton onClick={() => setSearch({ open: true, query: selection.text.slice(0, 80) })} title="Im Dokument suchen">
            <Search />
          </SelButton>
          <SelButton onClick={() => copy(selection.text, "Kopiert")} title="Text kopieren">
            <Copy />
          </SelButton>
        </div>
      )}

      {snip && (
        <SnipCard
          {...snip}
          target={notes.target}
          busy={snipBusy}
          onInsert={() => notes.target && withSnip((md) => notes.send(notes.target!.noteId, md))}
          onCard={() => withSnip((md) => setCardDraft({ back: md }))}
          onCopy={copySnip}
          onClose={() => setSnip(null)}
        />
      )}

      {cardDraft !== null && (
        <FlashcardDialog
          open
          onOpenChange={(o) => !o && setCardDraft(null)}
          defaults={{ moduleId: moduleId ?? undefined, back: cardDraft.back, documentIds: [id] }}
        />
      )}
    </div>
  );
}

function ToolButton({ label, onClick, disabled, active, className, children }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-4",
        active && "bg-accent text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function SelButton({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 font-medium hover:bg-accent [&_svg]:size-3.5 [&_svg]:text-muted-foreground">
      {children}
    </button>
  );
}

function PageInput({ page, total, onGo, disabled, inputRef }: { page: number; total: number; onGo: (p: number) => void; disabled: boolean; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const n = Number(draft);
    if (draft !== null && Number.isInteger(n) && n >= 1) onGo(Math.min(n, total));
    setDraft(null);
  };
  return (
    <label className="flex items-center gap-1 text-[13px] text-muted-foreground tabular-nums">
      <span className="sr-only">Seite</span>
      <input
        ref={inputRef}
        value={draft ?? (total ? String(page) : "–")}
        disabled={disabled}
        inputMode="numeric"
        onFocus={(e) => {
          setDraft(String(page));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 5))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        className="h-7 w-11 rounded-md border bg-background text-center text-[13px] font-medium text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        title="Seite (G)"
      />
      <span className="whitespace-nowrap">/ {total || "…"}</span>
    </label>
  );
}

function SearchBar({
  inputRef,
  query,
  onQuery,
  count,
  index,
  searching,
  onStep,
  onClose,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (q: string) => void;
  count: number;
  index: number;
  searching: boolean;
  onStep: (dir: 1 | -1) => void;
  onClose: () => void;
}) {
  const short = normalizeQuery(query).length < 2;
  return (
    <div className="absolute top-2 right-3 z-20 flex w-80 max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-lg border bg-background p-1 shadow-lg">
      <Search className="ml-1.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onStep(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="Im Dokument suchen …"
        aria-label="Im Dokument suchen"
        className="h-7 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
      />
      <span className="shrink-0 px-1 text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {short ? "" : searching && !count ? <Loader2 className="size-3.5 animate-spin" /> : count ? `${index + 1}/${count}${searching ? "…" : ""}` : "Keine Treffer"}
      </span>
      <button type="button" onClick={() => onStep(-1)} disabled={!count} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-35" title="Vorheriger Treffer (⇧↵)" aria-label="Vorheriger Treffer">
        <ChevronUp className="size-4" />
      </button>
      <button type="button" onClick={() => onStep(1)} disabled={!count} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-35" title="Nächster Treffer (↵)" aria-label="Nächster Treffer">
        <ChevronDown className="size-4" />
      </button>
      <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Schließen (Esc)" aria-label="Suche schließen">
        <X className="size-4" />
      </button>
    </div>
  );
}

function Thumbnails({ sizes, page, getPage, rotation, onGo }: { sizes: Size[]; page: number; getPage: (i: number) => Promise<PDFPageProxy>; rotation: number; onGo: (p: number) => void }) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector(`[data-thumb="${page}"]`)?.scrollIntoView({ block: "nearest" });
  }, [page]);
  return (
    <ol ref={listRef} className="space-y-3 px-3 py-3">
      {sizes.map((s, i) => (
        <li key={i} data-thumb={i}>
          <button type="button" onClick={() => onGo(i)} className="group flex w-full flex-col items-center gap-1" aria-label={`Seite ${i + 1}`} aria-current={i === page ? "page" : undefined}>
            <span className={cn("rounded-[5px] p-0.5 ring-2 transition-colors", i === page ? "ring-link" : "ring-transparent group-hover:ring-border")}>
              <PdfThumb index={i} width={132} aspect={s.h / s.w} getPage={getPage} rotation={rotation} />
            </span>
            <span className={cn("text-[11px] tabular-nums", i === page ? "font-semibold text-foreground" : "text-muted-foreground")}>{i + 1}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function Outline({ items, onGo, depth = 0 }: { items: OutlineNode[]; onGo: (dest: unknown) => void; depth?: number }) {
  return (
    <ul className={cn(depth === 0 && "p-1.5")}>
      {items.map((item, i) => (
        <OutlineItem key={i} item={item} onGo={onGo} depth={depth} />
      ))}
    </ul>
  );
}

function OutlineItem({ item, onGo, depth }: { item: OutlineNode; onGo: (dest: unknown) => void; depth: number }) {
  const [open, setOpen] = useState(depth === 0 && item.items.length <= 12);
  const hasChildren = item.items.length > 0;
  return (
    <li>
      <div className="group flex items-start rounded-md hover:bg-sidebar-accent" style={{ paddingLeft: depth * 12 }}>
        <button type="button" onClick={() => setOpen((o) => !o)} className={cn("mt-1 rounded p-0.5 text-muted-foreground", !hasChildren && "invisible")} aria-label={open ? "Zuklappen" : "Aufklappen"} aria-expanded={open}>
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </button>
        <button
          type="button"
          onClick={() => (item.url ? window.open(item.url, "_blank", "noopener") : onGo(item.dest))}
          className={cn("min-w-0 flex-1 py-1 pr-1.5 text-left text-[13px] leading-snug", item.bold && "font-semibold", item.italic && "italic")}
        >
          {item.title}
        </button>
      </div>
      {hasChildren && open && <Outline items={item.items} onGo={onGo} depth={depth + 1} />}
    </li>
  );
}

function PdfKeyboardHelp() {
  return (
    <p className="border-t pt-3 text-xs leading-6 text-muted-foreground">
      <Kbd>←</Kbd> <Kbd>→</Kbd> Seite · <Kbd>G</Kbd> Gehe zu · <Kbd>⌘F</Kbd> Suchen · <Kbd>⌘+</Kbd> <Kbd>⌘−</Kbd> Zoom · <Kbd>R</Kbd> Drehen · <Kbd>I</Kbd> Dunkel · <Kbd>S</Kbd> Seitenleiste · <Kbd>A</Kbd> Ausschnitt
    </p>
  );
}
