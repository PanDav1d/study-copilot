"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { useWorkspace } from "@/components/shell/workspace";

/**
 * Link to a PDF page inside notes and cards: opens the document *beside* the
 * current page (split view), so notes and slides stay side by side.
 * ⌘/Ctrl-click opens it as its own tab instead.
 */
export function DocLink({ href, children }: { href: string; children: ReactNode }) {
  const workspace = useWorkspace();
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (e.button !== 0 || e.shiftKey || e.altKey) return;
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) workspace.openTab(href);
        else workspace.openBeside(href);
      }}
      title="Daneben öffnen (⌘-Klick: als Tab)"
      className="inline-flex items-center gap-1 rounded bg-accent px-1 font-medium text-accent-foreground no-underline hover:bg-link/15"
    >
      <FileText className="size-3.5" aria-hidden />
      {children}
    </Link>
  );
}
