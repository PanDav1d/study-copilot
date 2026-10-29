"use client";

import { useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { dropImages, pasteImages } from "@/components/media/upload-image";
import { Markdown } from "@/components/markdown";
import { useAction } from "@/hooks/use-action";
import { createFlashcard, updateFlashcard } from "@/server/actions/flashcards";
import { showReward } from "@/components/gamification/reward";
import { DocumentMultiSelect, ModuleSelect } from "./pickers";

export interface FlashcardValues {
  id?: string;
  moduleId: string;
  noteId: string | null;
  front: string;
  back: string;
  topic: string | null;
  documentIds: string[];
}

export function FlashcardDialog({
  open,
  onOpenChange,
  initial,
  defaults,
  topics = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: FlashcardValues;
  defaults?: Partial<FlashcardValues>;
  topics?: string[];
}) {
  const base = initial ?? defaults;
  const empty = { front: "", back: "" };
  const [form, setForm] = useState(() => ({
    moduleId: base?.moduleId ?? "",
    noteId: base?.noteId ?? "",
    front: base?.front ?? "",
    back: base?.back ?? "",
    topic: base?.topic ?? "",
    documentIds: base?.documentIds ?? [],
  }));
  const [preview, setPreview] = useState(false);
  const [count, setCount] = useState(0);
  const create = useAction(createFlashcard, { success: "Karteikarte erstellt" });
  const update = useAction(updateFlashcard, { success: "Karteikarte gespeichert" });
  const fe = initial?.id ? update.fieldErrors : create.fieldErrors;

  async function submit(e: React.FormEvent, keepOpen = false) {
    e.preventDefault();
    if (initial?.id) {
      if ((await update.run({ id: initial.id, data: form })) !== undefined) onOpenChange(false);
      return;
    }
    const res = await create.run(form);
    if (!res) return;
    showReward(res.reward, undefined, { quiet: true });
    setCount((c) => c + 1);
    if (keepOpen) {
      // Rapid entry: keep module/topic/documents, clear the card content.
      setForm((f) => ({ ...f, ...empty }));
      document.getElementById("fc-front")?.focus();
    } else {
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial?.id ? "Karteikarte bearbeiten" : "Neue Karteikarte"}
      description={count > 0 ? `${count} Karte${count === 1 ? "" : "n"} in dieser Runde erstellt` : undefined}
      size="lg"
    >
      <form
        id="flashcard-form"
        onSubmit={(e) => submit(e, !initial?.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e, !initial?.id);
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Modul" htmlFor="fc-module" error={fe.moduleId}>
          <ModuleSelect id="fc-module" value={form.moduleId} onChange={(v) => setForm({ ...form, moduleId: v, noteId: v === base?.moduleId ? form.noteId : "" })} />
        </Field>
        <Field label="Thema" htmlFor="fc-topic" error={fe.topic} hint="Zum Gruppieren und gezielten Lernen.">
          <Input id="fc-topic" list="fc-topics" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="z. B. Normalformen" />
          <datalist id="fc-topics">
            {topics.map((t) => <option key={t} value={t} />)}
          </datalist>
        </Field>
        <div className="flex items-center justify-between sm:col-span-2">
          <span className="text-xs text-muted-foreground">Markdown wird unterstützt (Listen, **fett**, `Code`, Tabellen).</span>
          <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)}>
            {preview ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
            {preview ? "Bearbeiten" : "Vorschau"}
          </Button>
        </div>
        {preview ? (
          <>
            <div className="min-h-28 rounded-lg border bg-muted/40 p-3"><p className="mb-1 text-xs font-medium text-muted-foreground">Vorderseite</p><Markdown>{form.front || "–"}</Markdown></div>
            <div className="min-h-28 rounded-lg border bg-muted/40 p-3"><p className="mb-1 text-xs font-medium text-muted-foreground">Rückseite</p><Markdown>{form.back || "–"}</Markdown></div>
          </>
        ) : (
          <>
            <Field label="Vorderseite (Frage / Begriff)" htmlFor="fc-front" error={fe.front}>
              <Textarea id="fc-front" rows={5} onPaste={pasteImages} onDrop={dropImages} value={form.front} onChange={(e) => setForm({ ...form, front: e.target.value })} required autoFocus />
            </Field>
            <Field label="Rückseite (Antwort / Erklärung)" htmlFor="fc-back" error={fe.back}>
              <Textarea id="fc-back" rows={5} onPaste={pasteImages} onDrop={dropImages} value={form.back} onChange={(e) => setForm({ ...form, back: e.target.value })} required />
            </Field>
          </>
        )}
        <Field label="Verknüpfte Unterlagen" className="sm:col-span-2">
          <DocumentMultiSelect value={form.documentIds} onChange={(v) => setForm({ ...form, documentIds: v })} moduleId={form.moduleId} />
        </Field>
      </form>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {!initial?.id && <span className="mr-auto hidden text-xs text-muted-foreground sm:inline">⌘/Strg + Enter: speichern & nächste</span>}
        <Button variant="secondary" onClick={() => onOpenChange(false)}>{count > 0 ? "Fertig" : "Abbrechen"}</Button>
        {initial?.id ? (
          <Button type="submit" form="flashcard-form" loading={update.pending}>Speichern</Button>
        ) : (
          <Button type="submit" form="flashcard-form" loading={create.pending}>Speichern & nächste</Button>
        )}
      </div>
    </Dialog>
  );
}
