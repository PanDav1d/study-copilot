"use client";

import { memo, useEffect, useRef, useState } from "react";
import { CSS_UNITS, itemRanges, pageText } from "@/lib/pdf-view";
import { loadPdfJs, type PDFPageProxy, type TextContent } from "./pdfjs";

/** Max canvas size in pixels (Safari/WebKit refuses larger canvases). */
const MAX_CANVAS_PIXELS = 4096 * 4096;

export interface PageLink {
  left: number;
  top: number;
  width: number;
  height: number;
  url?: string;
  dest?: unknown;
}

export interface PageHighlight {
  start: number;
  end: number;
  /** Global match index – the selected one is emphasised and scrolled into view. */
  index: number;
}

export const PdfPage = memo(function PdfPage({
  index,
  top,
  width,
  height,
  zoom,
  renderZoom,
  rotation,
  active,
  getPage,
  getText,
  highlights,
  selected,
  onLink,
}: {
  index: number;
  top: number;
  width: number;
  height: number;
  /** Live zoom (CSS size of the page and text layer). */
  zoom: number;
  /** Zoom the canvas is rendered at – follows `zoom` once it settles (pinch zoom stays smooth). */
  renderZoom: number;
  rotation: number;
  /** Near the viewport: render; otherwise the canvas is released. */
  active: boolean;
  getPage: (i: number) => Promise<PDFPageProxy>;
  getText: (i: number) => Promise<TextContent>;
  highlights: PageHighlight[] | undefined;
  selected: number;
  onLink: (link: PageLink) => void;
}) {
  const canvasWrap = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [textReady, setTextReady] = useState<{ items: string[]; divs: HTMLElement[]; eol: boolean[] } | null>(null);
  const [links, setLinks] = useState<PageLink[]>([]);
  const [rendered, setRendered] = useState(false);
  const scrolledTo = useRef(-1);

  // Canvas + text layer.
  useEffect(() => {
    if (!active) {
      canvasWrap.current?.replaceChildren();
      textRef.current?.replaceChildren();
      setTextReady(null);
      setRendered(false);
      return;
    }
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    let textLayer: { cancel: () => void } | null = null;
    (async () => {
      const [pdfjs, page] = await Promise.all([loadPdfJs(), getPage(index)]);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: renderZoom * CSS_UNITS, rotation: (page.rotate + rotation) % 360 });
      const dpr = window.devicePixelRatio || 1;
      const ratio = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.className = "pdf-canvas";
      task = page.render({
        canvasContext: canvas.getContext("2d", { alpha: false })!,
        canvas,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      try {
        await task.promise;
      } catch {
        return; // cancelled
      }
      if (cancelled) return;
      // Swap only when the new canvas is ready – no white flash while zooming.
      canvasWrap.current?.replaceChildren(canvas);
      setRendered(true);

      const content = await getText(index);
      if (cancelled || !textRef.current) return;
      const div = textRef.current;
      div.replaceChildren();
      const layer = new pdfjs.TextLayer({ textContentSource: content, container: div, viewport });
      textLayer = layer;
      try {
        await layer.render();
      } catch {
        return;
      }
      if (cancelled) return;
      // As in pdf.js' viewer: while selecting, this layer covers the page, so
      // dragging between text spans does not select up to the end of the page.
      const end = document.createElement("div");
      end.className = "endOfContent";
      div.append(end);
      const items = content.items.filter((i) => "str" in i) as { str: string; hasEOL: boolean }[];
      setTextReady({ items: layer.textContentItemsStr.slice(), divs: layer.textDivs.slice(), eol: items.map((i) => i.hasEOL) });

      // Links (internal targets and URLs) as transparent overlays, positioned in %.
      const annotations = await page.getAnnotations({ intent: "display" });
      if (cancelled) return;
      const next: PageLink[] = [];
      for (const a of annotations) {
        if (a.subtype !== "Link" || (!a.url && !a.dest)) continue;
        const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect);
        next.push({
          left: (Math.min(x1, x2) / viewport.width) * 100,
          top: (Math.min(y1, y2) / viewport.height) * 100,
          width: (Math.abs(x2 - x1) / viewport.width) * 100,
          height: (Math.abs(y2 - y1) / viewport.height) * 100,
          url: typeof a.url === "string" && /^(https?:|mailto:)/i.test(a.url) ? a.url : undefined,
          dest: a.dest ?? undefined,
        });
      }
      setLinks(next);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
    };
  }, [active, renderZoom, rotation, index, getPage, getText]);

  // Search highlights inside the text layer.
  useEffect(() => {
    if (!textReady) return;
    const { items, divs, eol } = textReady;
    for (const [i, d] of divs.entries()) if (d.dataset.hl) {
      d.textContent = items[i] ?? "";
      delete d.dataset.hl;
    }
    if (!highlights?.length) return;
    const pt = pageText(items.map((str, i) => ({ str, hasEOL: eol[i] })));
    const ranges = itemRanges(pt, items.map((s) => s.length), highlights);
    let selectedEl: HTMLElement | null = null;
    for (const [i, list] of ranges) {
      const d = divs[i];
      const str = items[i];
      if (!d || str === undefined) continue;
      const frag = document.createDocumentFragment();
      let at = 0;
      for (const [from, to, idx] of list) {
        if (from > at) frag.append(str.slice(at, from));
        const mark = document.createElement("mark");
        mark.textContent = str.slice(from, to);
        if (idx === selected) {
          mark.className = "selected";
          selectedEl ??= mark;
        }
        frag.append(mark);
        at = to;
      }
      if (at < str.length) frag.append(str.slice(at));
      d.replaceChildren(frag);
      d.dataset.hl = "1";
    }
    // Only when the selection moved here – not again on every re-render (zoom).
    if (selectedEl && scrolledTo.current !== selected) {
      scrolledTo.current = selected;
      selectedEl.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }, [textReady, highlights, selected]);

  return (
    <div
      data-page={index + 1}
      className="pdf-page absolute left-1/2 -translate-x-1/2"
      style={{ top, width, height, "--total-scale-factor": zoom * CSS_UNITS, "--scale-round-x": "1px", "--scale-round-y": "1px" } as React.CSSProperties}
    >
      <div ref={canvasWrap} className="pdf-canvas-wrap absolute inset-0" />
      {!rendered && <div className="pdf-skeleton absolute inset-0" aria-hidden />}
      <div
        ref={textRef}
        className="textLayer"
        onPointerDown={(e) => {
          const layer = e.currentTarget;
          layer.classList.add("selecting");
          window.addEventListener("pointerup", () => layer.classList.remove("selecting"), { once: true });
        }}
      />
      {links.map((l, i) => (
        <a
          key={i}
          href={l.url ?? "#"}
          target={l.url ? "_blank" : undefined}
          rel={l.url ? "noopener noreferrer" : undefined}
          onClick={(e) => {
            if (l.url) return;
            e.preventDefault();
            onLink(l);
          }}
          className="pdf-link absolute z-[2]"
          style={{ left: `${l.left}%`, top: `${l.top}%`, width: `${l.width}%`, height: `${l.height}%` }}
          title={l.url ?? "Gehe zu"}
          aria-label={l.url ? `Link: ${l.url}` : "Interner Verweis"}
        />
      ))}
    </div>
  );
});

/** Small page preview for the sidebar – rendered once when it scrolls into view. */
export const PdfThumb = memo(function PdfThumb({ index, width, aspect, getPage, rotation }: { index: number; width: number; aspect: number; getPage: (i: number) => Promise<PDFPageProxy>; rotation: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      const page = await getPage(index);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 });
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (width / base.width) * dpr, rotation: (page.rotate + rotation) % 360 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.className = "pdf-canvas";
      const t = page.render({ canvasContext: canvas.getContext("2d", { alpha: false })!, canvas, viewport });
      task = t;
      try {
        await t.promise;
      } catch {
        return;
      }
      if (!cancelled) ref.current?.replaceChildren(canvas);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, index, width, getPage, rotation]);
  return <div ref={ref} className="pdf-canvas-wrap pdf-skeleton relative overflow-hidden rounded-[3px]" style={{ width, height: Math.round(width * aspect) }} />;
});
