"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";

export function LinkDocumentDialog({
  documents,
  moduleId,
  onPick,
  onClose,
}: {
  documents: { id: string; title: string; moduleId: string | null; module: { name: string } | null }[];
  moduleId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = documents
    .filter((d) => d.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.moduleId === moduleId) - Number(a.moduleId === moduleId));
  return (
    <Dialog open onOpenChange={onClose} title="Unterlage verknüpfen">
      <Input placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} autoFocus className="mb-3" />
      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {filtered.length === 0 && <li className="text-sm text-muted-foreground">Keine passenden Unterlagen.</li>}
        {filtered.map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => onPick(d.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted">
              <FileText className="size-4 shrink-0 text-danger" aria-hidden />
              <span className="truncate">{d.title}</span>
              {d.module && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{d.module.name}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export function InsertDocLinkDialog({
  documents,
  onInsert,
  onClose,
}: {
  documents: { id: string; title: string }[];
  onInsert: (id: string, title: string, page?: number) => void;
  onClose: () => void;
}) {
  const [docId, setDocId] = useState(documents[0]?.id ?? "");
  const [page, setPage] = useState("");
  const doc = documents.find((d) => d.id === docId);
  return (
    <Dialog open onOpenChange={onClose} title="PDF-Link einfügen" description="Fügt an der Cursorposition einen Link ein, der das PDF (optional auf einer bestimmten Seite) öffnet." size="sm">
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Dieses Modul hat noch keine Unterlagen. Lade zuerst ein PDF hoch.</p>
      ) : (
        <div className="grid gap-4">
          <Field label="Dokument" htmlFor="idl-doc">
            <Select id="idl-doc" value={docId} onChange={(e) => setDocId(e.target.value)}>
              {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </Select>
          </Field>
          <Field label="Seite (optional)" htmlFor="idl-page">
            <Input id="idl-page" type="number" min={1} value={page} onChange={(e) => setPage(e.target.value)} />
          </Field>
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        <Button disabled={!doc} onClick={() => doc && onInsert(doc.id, doc.title, page ? Math.max(1, Number(page)) : undefined)}>Einfügen</Button>
      </div>
    </Dialog>
  );
}
