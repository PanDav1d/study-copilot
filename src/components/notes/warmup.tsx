"use client";

import { useState } from "react";
import { Columns2, Flame, X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import type { CornellRow } from "@/lib/cornell";
import { sessionLabel } from "@/lib/labels";
import { useWorkspace } from "@/components/shell/workspace";
import { cn } from "@/lib/utils";

export interface Warmup {
  id: string;
  title: string;
  date: Date;
  rows: CornellRow[];
}

/**
 * Two minutes before the lecture: answer a few questions of the previous
 * session from memory. Retrieval of old material makes the new material
 * easier to learn (forward testing effect) and connects the sessions.
 * Answers stay covered until asked for – trying first is the point.
 */
export function WarmupCard({ warmup }: { warmup: Warmup }) {
  const { openBeside } = useWorkspace();
  const beside = () => openBeside(`/notes/${warmup.id}`);
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="mb-3 flex items-start gap-3">
        <Flame className="mt-0.5 size-4 shrink-0 text-orange-500" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">Aufwärmen: 2 Minuten vor der Vorlesung</p>
          <p className="text-muted-foreground">
            Beantworte zuerst im Kopf, dann aufdecken. Wer sich an die letzte Sitzung erinnert, lernt die neue leichter. Aus{" "}
            <button type="button" onClick={beside} className="underline-offset-2 hover:underline">{sessionLabel(warmup)}</button>.
          </p>
        </div>
        <button type="button" onClick={beside} className={buttonClass("ghost", "icon-sm")} title="Letzte Sitzung daneben öffnen" aria-label="Letzte Sitzung daneben öffnen">
          <Columns2 className="size-4" />
        </button>
        <button type="button" onClick={() => setHidden(true)} className={buttonClass("ghost", "icon-sm")} aria-label="Aufwärmen ausblenden" title="Ausblenden">
          <X className="size-4" />
        </button>
      </div>
      <ol className="divide-y rounded-lg border">
        {warmup.rows.map((r) => {
          const open = shown.has(r.id);
          return (
            <li key={r.id}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setShown((s) => new Set(s).add(r.id))}
                className={cn("block w-full px-3 py-2 text-left text-sm", !open && "hover:bg-muted/50")}
              >
                <div className="font-medium"><Markdown>{r.cue}</Markdown></div>
                {open ? (
                  <div className="mt-1 text-muted-foreground"><Markdown>{r.content}</Markdown></div>
                ) : (
                  <span className="mt-0.5 block text-xs text-muted-foreground">Aufdecken</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
