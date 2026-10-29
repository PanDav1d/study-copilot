"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { SemesterDialog, type SemesterValues } from "@/components/forms/semester-dialog";
import { ModuleDialog, type ModuleValues } from "@/components/forms/module-dialog";
import { NoteCreateDialog } from "@/components/forms/note-dialog";
import { useAction } from "@/hooks/use-action";
import { deleteModule, deleteSemester } from "@/server/actions/structure";

export function NewSemesterButton({ variant = "primary" }: { variant?: ButtonVariant }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}><Plus className="size-4" /> Semester</Button>
      {open && <SemesterDialog open onOpenChange={setOpen} />}
    </>
  );
}

export function NewModuleButton({ semesterId, variant = "primary", size = "md", label = "Modul" }: { semesterId?: string; variant?: ButtonVariant; size?: ButtonSize; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}><Plus className="size-4" /> {label}</Button>
      {open && <ModuleDialog open onOpenChange={setOpen} semesterId={semesterId} />}
    </>
  );
}

export function NewNoteButton({ moduleId, variant = "primary", size = "md" }: { moduleId?: string; variant?: ButtonVariant; size?: ButtonSize }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}><Plus className="size-4" /> Sitzung</Button>
      {open && <NoteCreateDialog open onOpenChange={setOpen} moduleId={moduleId} />}
    </>
  );
}

function MoreButton() {
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Weitere Aktionen">
      <MoreHorizontal className="size-4" />
    </Button>
  );
}

export function SemesterMenu({ semester }: { semester: SemesterValues & { id: string } }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const del = useAction(deleteSemester, { success: "Semester gelöscht" });
  return (
    <>
      <Dropdown trigger={<MoreButton />}>
        <DropdownItem icon={<Pencil className="size-4" />} onSelect={() => setDialog("edit")}>Bearbeiten</DropdownItem>
        <DropdownItem danger icon={<Trash2 className="size-4" />} onSelect={() => setDialog("delete")}>Löschen</DropdownItem>
      </Dropdown>
      {dialog === "edit" && <SemesterDialog open onOpenChange={() => setDialog(null)} initial={semester} />}
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={() => setDialog(null)}
        title="Semester löschen?"
        description={<>„{semester.name}“ wird mit <strong>allen Modulen, Sitzungen, Karteikarten, Terminen und Unterlagen</strong> endgültig gelöscht.</>}
        onConfirm={async () => {
          if ((await del.run({ id: semester.id })) !== undefined) router.push("/semesters");
        }}
      />
    </>
  );
}

export function ModuleMenu({ module }: { module: ModuleValues & { id: string } }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const del = useAction(deleteModule, { success: "Modul gelöscht" });
  return (
    <>
      <Button variant="secondary" onClick={() => setDialog("edit")}><Pencil className="size-4" /> Bearbeiten</Button>
      <Dropdown trigger={<MoreButton />}>
        <DropdownItem danger icon={<Trash2 className="size-4" />} onSelect={() => setDialog("delete")}>Modul löschen</DropdownItem>
      </Dropdown>
      {dialog === "edit" && <ModuleDialog open onOpenChange={() => setDialog(null)} initial={module} />}
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={() => setDialog(null)}
        title="Modul löschen?"
        description={<>„{module.name}“ wird mit allen Sitzungen, Karteikarten (inkl. Lernhistorie), Terminen und Unterlagen endgültig gelöscht.</>}
        onConfirm={async () => {
          if ((await del.run({ id: module.id })) !== undefined) router.push(`/semesters/${module.semesterId}`);
        }}
      />
    </>
  );
}

/** Opens the module dialog right on its exam tab (date, form, room, shared exam). */
export function EditExamButton({ module, label = "Eckdaten bearbeiten" }: { module: ModuleValues & { id: string }; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><Pencil className="size-3.5" /> {label}</Button>
      {open && <ModuleDialog open onOpenChange={setOpen} initial={module} initialTab="exam" />}
    </>
  );
}
