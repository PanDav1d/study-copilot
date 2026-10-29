"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { PdfViewerProps } from "./pdf-viewer";

/** pdf.js needs the browser: the viewer is loaded on the client only. */
const Viewer = dynamic(() => import("./pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  ),
});

export function PdfViewer(props: PdfViewerProps) {
  return <Viewer {...props} />;
}
