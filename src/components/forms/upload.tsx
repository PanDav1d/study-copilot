"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { ModuleSelect, SemesterSelect, SessionSelect } from "./pickers";

export interface UploadTarget {
  semesterId?: string;
  moduleId?: string;
  /** Link the uploaded PDFs to this session. */
  noteId?: string;
}

export async function uploadFiles(files: File[], target: UploadTarget) {
  const body = new FormData();
  for (const f of files) body.append("files", f);
  for (const [k, v] of Object.entries(target)) if (v) body.append(k, v);
  const res = await fetch("/api/documents/upload", { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as { created?: { id: string; title: string }[]; errors?: string[]; error?: string };
  for (const err of json.errors ?? []) toast.error(err);
  if (json.error) toast.error(json.error);
  const created = json.created ?? [];
  if (created.length) toast.success(created.length === 1 ? `„${created[0]!.title}“ hochgeladen` : `${created.length} Dateien hochgeladen`);
  return created;
}

function pdfsFrom(list: FileList | null) {
  const files = Array.from(list ?? []);
  const pdfs = files.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
  if (pdfs.length < files.length) toast.error("Nur PDF-Dateien werden unterstützt.");
  return pdfs;
}

/**
 * Drag & drop zone. Wraps arbitrary children (e.g. a whole page section) or
 * renders a default drop area.
 */
export function Dropzone({
  target,
  children,
  className,
  onUploaded,
  compact,
}: {
  target: UploadTarget;
  /** Custom content to wrap; files dropped anywhere on it are uploaded. */
  children?: ReactNode;
  className?: string;
  onUploaded?: (created: { id: string; title: string }[]) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const depth = useRef(0);
  const openPicker = useCallback(() => input.current?.click(), []);

  const handle = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setBusy(true);
      try {
        const created = await uploadFiles(files, target);
        if (created.length) {
          onUploaded?.(created);
          router.refresh();
        }
      } catch {
        toast.error("Upload fehlgeschlagen.");
      } finally {
        setBusy(false);
      }
    },
    [target, onUploaded, router],
  );

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        handle(pdfsFrom(e.dataTransfer.files));
      }}
    >
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { handle(pdfsFrom(e.target.files)); e.target.value = ""; }} />
      {children ?? (
        <button
          type="button"
          onClick={openPicker}
          disabled={busy}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-center text-sm text-muted-foreground transition hover:border-primary/50 hover:bg-accent/40",
            compact ? "px-4 py-4" : "px-6 py-8",
          )}
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <FileUp className="size-5" />}
          <span><span className="font-medium text-foreground">PDF hierher ziehen</span> oder klicken zum Auswählen</span>
        </button>
      )}
      {(over || (busy && children)) && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-accent/80 text-sm font-medium text-accent-foreground backdrop-blur-sm">
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileUp className="mr-2 size-4" />}
          {busy ? "Wird hochgeladen …" : "PDF hier ablegen"}
        </div>
      )}
    </div>
  );
}

export function UploadDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: UploadTarget }) {
  const [target, setTarget] = useState<UploadTarget>(initial ?? {});
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Unterlagen hochladen" description="PDFs einem Semester oder Modul zuordnen und optional mit einer Sitzung verknüpfen.">
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Semester" htmlFor="u-sem">
            <SemesterSelect id="u-sem" allowEmpty="Nicht zugeordnet" value={target.semesterId ?? ""} onChange={(v) => setTarget({ semesterId: v || undefined })} />
          </Field>
          <Field label="Modul" htmlFor="u-mod">
            <ModuleSelect id="u-mod" allowEmpty="Kein Modul" semesterId={target.semesterId} value={target.moduleId ?? ""} onChange={(v) => setTarget({ ...target, moduleId: v || undefined, noteId: undefined })} />
          </Field>
        </div>
        {target.moduleId && (
          <Field label="Mit Sitzung verknüpfen" htmlFor="u-lec">
            <SessionSelect id="u-lec" moduleId={target.moduleId} value={target.noteId ?? ""} onChange={(v) => setTarget({ ...target, noteId: v || undefined })} />
          </Field>
        )}
        <Dropzone target={target} onUploaded={() => onOpenChange(false)} />
      </div>
      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Schließen</Button>
      </div>
    </Dialog>
  );
}
