"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { useAction } from "@/hooks/use-action";
import { toDateInput } from "@/lib/dates";
import { createNote } from "@/server/actions/notes";
import { ModuleSelect } from "./pickers";

/** A new session = a new Cornell sheet for one lecture day. Date first, topic optional. */
export function NoteCreateDialog({ open, onOpenChange, moduleId }: { open: boolean; onOpenChange: (o: boolean) => void; moduleId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ moduleId: moduleId ?? "", date: toDateInput(new Date()), title: "" });
  const create = useAction(createNote, { refresh: false });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await create.run(form);
    if (res) {
      if (res.linkedEvent) toast.success("Mit dem Kalendertermin des Tages verknüpft");
      onOpenChange(false);
      router.push(`/notes/${res.id}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Neue Sitzung" description="Eine Sitzung ist deine Cornell-Mitschrift für einen Vorlesungstag.">
      <form id="note-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <Field label="Modul" htmlFor="n-module" error={create.fieldErrors.moduleId} className="sm:col-span-2">
          <ModuleSelect id="n-module" value={form.moduleId} onChange={(v) => setForm({ ...form, moduleId: v })} />
        </Field>
        <Field label="Datum" htmlFor="n-date" error={create.fieldErrors.date}>
          <DateInput id="n-date" value={form.date} onChange={(date) => setForm({ ...form, date })} required />
        </Field>
        <Field label="Thema" htmlFor="n-title" error={create.fieldErrors.title} className="sm:col-span-3" hint="Optional – kannst du auch später ergänzen.">
          <Input id="n-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="z. B. Normalisierung" />
        </Field>
      </form>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Abbrechen</Button>
        <Button type="submit" form="note-form" loading={create.pending} disabled={!form.moduleId}>Loslegen</Button>
      </div>
    </Dialog>
  );
}
