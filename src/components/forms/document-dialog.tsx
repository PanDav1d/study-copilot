"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useAction } from "@/hooks/use-action";
import { updateDocument } from "@/server/actions/documents";
import { ModuleSelect, SemesterSelect } from "./pickers";

export interface DocumentValues {
  id: string;
  title: string;
  description: string;
  semesterId: string | null;
  moduleId: string | null;
}

export function DocumentDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial: DocumentValues }) {
  const [form, setForm] = useState({
    id: initial.id,
    title: initial.title,
    description: initial.description,
    semesterId: initial.semesterId ?? "",
    moduleId: initial.moduleId ?? "",
  });
  const update = useAction(updateDocument, { success: "Unterlage gespeichert" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await update.run(form)) !== undefined) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Unterlage bearbeiten">
      <form id="doc-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Titel" htmlFor="d-title" error={update.fieldErrors.title} className="sm:col-span-2">
          <Input id="d-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </Field>
        <Field label="Semester" htmlFor="d-sem">
          <SemesterSelect id="d-sem" allowEmpty="Nicht zugeordnet" value={form.semesterId} onChange={(v) => setForm({ ...form, semesterId: v, moduleId: "" })} />
        </Field>
        <Field label="Modul" htmlFor="d-mod">
          <ModuleSelect id="d-mod" allowEmpty="Kein Modul" semesterId={form.semesterId || undefined} value={form.moduleId} onChange={(v) => setForm({ ...form, moduleId: v })} />
        </Field>
        <Field label="Beschreibung" htmlFor="d-desc" className="sm:col-span-2">
          <Textarea id="d-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </form>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Abbrechen</Button>
        <Button type="submit" form="doc-form" loading={update.pending}>Speichern</Button>
      </div>
    </Dialog>
  );
}
