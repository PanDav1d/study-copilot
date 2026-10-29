"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { Field, Input } from "@/components/ui/form";
import { useAction } from "@/hooks/use-action";
import { deleteAttempt, deleteExam, updateExam } from "@/server/actions/exams";

export function ExamMenu({ exam }: { exam: { id: string; title: string; timeLimit: number | null } }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [form, setForm] = useState({ title: exam.title, timeLimit: exam.timeLimit ? String(exam.timeLimit) : "" });
  const update = useAction(updateExam, { success: "Gespeichert" });
  const del = useAction(deleteExam, { success: "Probeklausur gelöscht" });

  return (
    <>
      <Dropdown trigger={<Button variant="secondary" size="icon" aria-label="Weitere Aktionen"><MoreHorizontal className="size-4" /></Button>}>
        <DropdownItem icon={<Pencil className="size-4" />} onSelect={() => setDialog("edit")}>Bearbeiten</DropdownItem>
        <DropdownItem danger icon={<Trash2 className="size-4" />} onSelect={() => setDialog("delete")}>Löschen</DropdownItem>
      </Dropdown>
      <Dialog
        open={dialog === "edit"}
        onOpenChange={() => setDialog(null)}
        title="Probeklausur bearbeiten"
        footer={
          <Button
            loading={update.pending}
            onClick={async () => {
              if ((await update.run({ id: exam.id, ...form })) !== undefined) setDialog(null);
            }}
          >
            Speichern
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Titel" htmlFor="exam-edit-title" error={update.fieldErrors.title}>
            <Input id="exam-edit-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Zeitlimit (Minuten)" htmlFor="exam-edit-time" hint="Leer = ohne Zeitlimit" error={update.fieldErrors.timeLimit}>
            <Input id="exam-edit-time" type="number" min={1} max={600} value={form.timeLimit} onChange={(e) => setForm({ ...form, timeLimit: e.target.value })} />
          </Field>
        </div>
      </Dialog>
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={() => setDialog(null)}
        title="Probeklausur löschen?"
        description={<>„{exam.title}“ wird mit allen Versuchen gelöscht.</>}
        onConfirm={async () => {
          if ((await del.run({ id: exam.id })) !== undefined) router.push("/exams");
        }}
      />
    </>
  );
}

export function DeleteAttemptButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const del = useAction(deleteAttempt, { success: "Versuch gelöscht" });
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Versuch löschen" onClick={() => setOpen(true)}><Trash2 className="size-3.5" /></Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Versuch löschen?" description="Das Ergebnis wird aus deiner Historie entfernt." onConfirm={() => del.run({ id })} />
    </>
  );
}
