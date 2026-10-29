"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { useAction } from "@/hooks/use-action";
import { toDateInput } from "@/lib/dates";
import { createSemester, updateSemester } from "@/server/actions/structure";

export interface SemesterValues {
  id?: string;
  name: string;
  number: number | null;
  startDate: Date | null;
  endDate: Date | null;
}

export function SemesterDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: SemesterValues }) {
  const router = useRouter();
  const [form, setForm] = useState(() => ({
    name: initial?.name ?? "",
    number: initial?.number?.toString() ?? "",
    startDate: toDateInput(initial?.startDate),
    endDate: toDateInput(initial?.endDate),
  }));
  const create = useAction(createSemester, { success: "Semester angelegt" });
  const update = useAction(updateSemester, { success: "Semester gespeichert" });
  const pending = create.pending || update.pending;
  const fe = initial?.id ? update.fieldErrors : create.fieldErrors;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (initial?.id) {
      if ((await update.run({ id: initial.id, data: form })) !== undefined) onOpenChange(false);
    } else {
      const res = await create.run(form);
      if (res) {
        onOpenChange(false);
        router.push(`/semesters/${res.id}`);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={initial?.id ? "Semester bearbeiten" : "Neues Semester"}>
      <form id="semester-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-4">
        <Field label="Bezeichnung" htmlFor="s-name" error={fe.name} className="sm:col-span-3">
          <Input id="s-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. 3. Semester – WiSe 26/27" required autoFocus />
        </Field>
        <Field label="Nr." htmlFor="s-number" error={fe.number}>
          <Input id="s-number" type="number" min={1} max={20} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
        </Field>
        <Field label="Beginn" htmlFor="s-start" error={fe.startDate} className="sm:col-span-2">
          <DateInput id="s-start" value={form.startDate} onChange={(startDate) => setForm((f) => ({ ...f, startDate }))} />
        </Field>
        <Field label="Ende" htmlFor="s-end" error={fe.endDate} className="sm:col-span-2">
          <DateInput id="s-end" value={form.endDate} onChange={(endDate) => setForm((f) => ({ ...f, endDate }))} />
        </Field>
      </form>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Abbrechen</Button>
        <Button type="submit" form="semester-form" loading={pending}>Speichern</Button>
      </div>
    </Dialog>
  );
}
