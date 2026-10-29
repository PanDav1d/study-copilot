"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Check, Eye, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { AutoTextarea } from "@/components/notes/auto-textarea";
import { updateModuleSummaryNote } from "@/server/actions/structure";
import { useCommand } from "@/components/shell/commands";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

const SAVE_DELAY = 900;

/**
 * The module's exam-prep note: one plain Markdown page per module to collect and
 * write down everything for the exam summary. No Cornell rows, just text.
 */
export function ModuleSummaryNote({ moduleId, initial }: { moduleId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [editing, setEditing] = useState(() => !initial.trim());
  const { status, queue, flush } = useAutosave(moduleId);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) area.current?.focus({ preventScroll: true });
  }, [editing]);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  // Menu bar and shortcuts from anywhere on the page (the key handler below only works inside the note).
  useCommand("page.save", () => void flush());
  useCommand("note.toggleEdit", () => setEditing((v) => !v));

  return (
    <div
      className="rounded-xl border bg-card"
      // ⌘/Ctrl+S saves immediately, ⌘/Ctrl+E toggles edit/read – scoped to this note (split view).
      onKeyDown={(e) => {
        if (!(e.metaKey || e.ctrlKey)) return;
        const key = e.key.toLowerCase();
        if (key === "s") {
          e.preventDefault();
          void flush();
        } else if (key === "e") {
          e.preventDefault();
          setEditing((v) => !v);
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums">{words} {words === 1 ? "Wort" : "Wörter"}</span>
          <SaveIndicator status={status} onRetry={() => void flush()} />
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)} title="⌘E">
          {editing ? <><Eye className="size-4" /> Lesen</> : <><Pencil className="size-4" /> Bearbeiten</>}
        </Button>
      </div>

      <div className="px-4 py-4 sm:px-5">
        {editing ? (
          <AutoTextarea
            ref={area}
            minRows={16}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              queue(e.target.value);
            }}
            onBlur={() => void flush()}
            placeholder={"Alles für die Prüfung sammeln und in eigenen Worten herunterschreiben.\n\n# Thema 1\n- Kernaussage …\n- Formel, Definition, Beispiel …\n\nMarkdown wird unterstützt."}
            aria-label="Zusammenfassung zur Prüfungsvorbereitung"
          />
        ) : text.trim() ? (
          <div onDoubleClick={() => setEditing(true)} title="Doppelklick zum Bearbeiten">
            <Markdown>{text}</Markdown>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Pencil className="size-4" /> Zusammenfassung beginnen
          </button>
        )}
      </div>
    </div>
  );
}

/** Debounced, serialised autosave: at most one request in flight, always the latest text. */
function useAutosave(moduleId: string) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const pending = useRef<string | null>(null);
  const inflight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inflight.current) return;
    inflight.current = true;
    // Text typed while a request is running is sent in the next iteration.
    while (pending.current !== null) {
      const summaryNote = pending.current;
      pending.current = null;
      setStatus("saving");
      let ok = false;
      try {
        const res = await updateModuleSummaryNote({ id: moduleId, summaryNote });
        ok = res.ok;
        if (!res.ok) toast.error(res.error);
      } catch {
        toast.error("Speichern fehlgeschlagen – Verbindung prüfen.");
      }
      if (!ok) {
        pending.current ??= summaryNote;
        inflight.current = false;
        setStatus("error");
        return;
      }
    }
    inflight.current = false;
    setStatus("saved");
  }, [moduleId]);

  const queue = useCallback(
    (text: string) => {
      pending.current = text;
      setStatus("dirty");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY);
    },
    [flush],
  );

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current !== null || inflight.current) {
        void flush();
        e.preventDefault();
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", onHide);
      // Leaving the tab or page saves what is still pending.
      void flush();
    };
  }, [flush]);

  return { status, queue, flush };
}

export function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "error") {
    return (
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-xs font-medium text-danger">
        <AlertCircle className="size-3.5" /> Nicht gespeichert – erneut versuchen
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" aria-live="polite">
      {status === "saving" || status === "dirty" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5 text-success" />}
      {status === "saved" ? "Gespeichert" : "Speichert …"}
    </span>
  );
}
