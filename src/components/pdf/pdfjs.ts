"use client";

import type * as PdfJs from "pdfjs-dist";

export type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
export type TextContent = Awaited<ReturnType<PdfJs.PDFPageProxy["getTextContent"]>>;

let lib: Promise<typeof PdfJs> | null = null;

/**
 * pdf.js is loaded on demand (only the viewer needs it). The worker and its
 * assets are served from /pdfjs (copied there on install, see scripts/copy-pdfjs.mjs).
 */
export function loadPdfJs() {
  lib ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    return m;
  });
  return lib;
}

export const PDF_ASSETS = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
  iccUrl: "/pdfjs/iccs/",
  isEvalSupported: false,
} as const;
