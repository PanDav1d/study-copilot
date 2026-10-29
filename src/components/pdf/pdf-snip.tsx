"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Crop, Download, Layers, NotebookPen, X } from "lucide-react";
import { CSS_UNITS } from "@/lib/pdf-view";
import { cn } from "@/lib/utils";
import type { PDFPageProxy } from "./pdfjs";

/** Region of a page as fractions of its (rotated) width/height. */
export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const MAX_PIXELS = 4096 * 4096;

/**
 * Renders just the region of the page, sharp: about 1600 px wide (at least
 * twice the 100 % size), independent of the current zoom.
 */
export async function renderRegion(page: PDFPageProxy, rotation: number, r: Region): Promise<Blob> {
  const rot = (page.rotate + rotation) % 360;
  const base = page.getViewport({ scale: 1, rotation: rot });
  const regionW = (r.x1 - r.x0) * base.width;
  const regionH = (r.y1 - r.y0) * base.height;
  let scale = Math.min(Math.max(1600 / regionW, 2 * CSS_UNITS), 3200 / regionW);
  scale = Math.min(scale, Math.sqrt(MAX_PIXELS / (regionW * regionH)));
  const viewport = page.getViewport({ scale, rotation: rot });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(regionW * scale));
  canvas.height = Math.max(1, Math.round(regionH * scale));
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport, transform: [1, 0, 0, 1, -r.x0 * viewport.width, -r.y0 * viewport.height] }).promise;
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Bild konnte nicht erzeugt werden"))), "image/png"));
}

/** Crosshair layer over the pages: drag a rectangle, Esc cancels. */
export function SnipOverlay({ onDone, onCancel, onWheel }: { onDone: (rect: DOMRect) => void; onCancel: () => void; onWheel: (e: React.WheelEvent) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const local = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const norm = box && { left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) };
  return (
    <div
      ref={ref}
      className="absolute inset-0 z-20 cursor-crosshair touch-none bg-black/10"
      onWheel={onWheel}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = local(e);
        setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      }}
      onPointerMove={(e) => {
        if (!box || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const p = local(e);
        setBox({ ...box, x1: p.x, y1: p.y });
      }}
      onPointerUp={() => {
        if (!norm || norm.width < 8 || norm.height < 8) {
          setBox(null);
          return;
        }
        const r = ref.current!.getBoundingClientRect();
        onDone(new DOMRect(r.left + norm.left, r.top + norm.top, norm.width, norm.height));
      }}
    >
      {!box && (
        <div className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground/90 px-3 py-1.5 text-xs font-medium text-background shadow-lg">
          <Crop className="size-3.5" /> Bereich aufziehen · Esc bricht ab
        </div>
      )}
      {norm && (
        <div
          className="pointer-events-none absolute rounded-sm border-2 border-link bg-link/10 shadow-[0_0_0_9999px_rgb(0_0_0/0.25)]"
          style={{ left: norm.left, top: norm.top, width: norm.width, height: norm.height }}
        />
      )}
    </div>
  );
}

/** The cut-out region with what to do with it. */
export function SnipCard({
  blob,
  page,
  x,
  y,
  target,
  busy,
  onInsert,
  onCard,
  onCopy,
  onClose,
}: {
  blob: Blob;
  page: number;
  x: number;
  y: number;
  target: { title: string } | null;
  busy: boolean;
  onInsert: () => void;
  onCard: () => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="absolute z-30 w-72 max-w-[calc(100%-1rem)] -translate-x-1/2 overflow-hidden rounded-xl border bg-background shadow-xl" style={{ left: x, top: y }}>
      <div className="relative border-b bg-muted/50 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
        <img src={url} alt={`Ausschnitt Seite ${page}`} className="mx-auto max-h-40 rounded border bg-white object-contain" />
        <span className="absolute bottom-3 left-3 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">S. {page}</span>
        <button type="button" onClick={onClose} className="absolute top-2 right-2 rounded-full bg-background/90 p-1 text-muted-foreground shadow hover:text-foreground" aria-label="Verwerfen">
          <X className="size-3.5" />
        </button>
      </div>
      <div className={cn("space-y-0.5 p-1", busy && "pointer-events-none opacity-60")}>
        {target && (
          <SnipAction onClick={onInsert} primary icon={<NotebookPen />}>
            In <span className="truncate font-semibold">„{target.title}“</span> einfügen
          </SnipAction>
        )}
        <SnipAction onClick={onCard} icon={<Layers />}>
          Karteikarte damit anlegen
        </SnipAction>
        <SnipAction onClick={onCopy} icon={<Copy />}>
          Kopieren (Bild + Markdown)
        </SnipAction>
        <a href={url} download={`ausschnitt-s${page}.png`} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground">
          <Download /> Als PNG speichern
        </a>
      </div>
    </div>
  );
}

function SnipAction({ onClick, icon, primary, children }: { onClick: () => void; icon: React.ReactNode; primary?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[13px] [&_svg]:size-4 [&_svg]:shrink-0",
        primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-accent [&_svg]:text-muted-foreground",
      )}
    >
      {icon}
      <span className="flex min-w-0 items-center gap-1">{children}</span>
    </button>
  );
}
